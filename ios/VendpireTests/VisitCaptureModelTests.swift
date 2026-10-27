import SwiftData
import XCTest

@testable import Vendpire

/// The mutation layer the view used to hold privately: digit accumulation and
/// its cap, the fill-to-par recompute, what clearing clears, and what `Next`
/// does to focus. These rules run on every keystroke of the app's core
/// workflow, and until this model existed nothing could reach them.
@MainActor
final class VisitCaptureModelTests: XCTestCase {
    private var context: ModelContext!
    private var model: VisitCaptureModel!

    private func startCapture(
        slots: [[String]] = [["A0", "A2", "A4"]],
        planogrammed: [String] = ["A0", "A2", "A4"]
    ) throws {
        context = ModelContext(try VendpireStore.makeInMemoryContainer())

        let machine = StoredMachine(
            id: "machine-1", locationId: "location-1", name: "National 148",
            kind: "snack", slots: slots
        )
        context.insert(machine)
        context.insert(
            StoredPlanogram(
                id: "pg-1", machineId: "machine-1", effectiveFrom: .distantPast,
                slots: planogrammed.map {
                    PlanogramSlot(slotCode: $0, productId: "p-\($0)", par: 10, priceCents: 175)
                }
            )
        )
        context.insert(
            StoredProduct(
                id: "p-A0", name: "Big Texas Cinnamon Roll",
                category: "pastry", defaultPriceCents: 175
            )
        )
        try context.save()

        model = VisitCaptureModel()
        model.start(at: machine, context: context)
    }

    private var focusedLine: DraftLine? {
        model.focusedLine
    }

    // MARK: - Starting

    func testStartFocusesTheFirstSlotInCaptureOrder() throws {
        try startCapture()

        XCTAssertEqual(model.focus?.slotCode, "A0")
        XCTAssertEqual(model.field, .left)
        XCTAssertEqual(model.focusedProductName, "Big Texas Cinnamon Roll")
    }

    func testAProductMissingFromTheMirrorStillHasAName() throws {
        try startCapture()
        model.focusSlot(code: "A2")

        XCTAssertEqual(model.focusedProductName, "Unknown product")
    }

    // MARK: - Typing

    func testDigitsAccumulate() throws {
        try startCapture()

        model.type(1)
        model.type(2)

        XCTAssertEqual(focusedLine?.remaining, 12)
    }

    /// The server rejects counts above 999, and a stuck key must not produce
    /// one locally that only fails hours later in the drain.
    func testACountCapsAtTheServersLimit() throws {
        try startCapture()

        for _ in 1...5 { model.type(9) }

        XCTAssertEqual(focusedLine?.remaining, 999)
    }

    /// The whole ergonomic win: enter what is left, and what to add is already
    /// filled in — recomputed on every keystroke.
    func testTypingLeftRecomputesTheFillDefault() throws {
        try startCapture()

        model.type(4)
        XCTAssertEqual(focusedLine?.added, 6)

        model.type(0)  // remaining is now 40, over par
        XCTAssertEqual(focusedLine?.added, 0)
    }

    func testTypingIntoAddingOverridesTheDefaultWithoutTouchingLeft() throws {
        try startCapture()
        model.type(4)

        model.toggleField()
        model.type(9)

        XCTAssertEqual(focusedLine?.remaining, 4)
        XCTAssertEqual(focusedLine?.added, 69, "6 was the default; 9 accumulates onto it")
    }

    // MARK: - Clearing

    func testClearingLeftClearsBothFields() throws {
        try startCapture()
        model.type(4)

        model.clear(.left)

        XCTAssertNil(focusedLine?.remaining)
        XCTAssertNil(focusedLine?.added, "a default derived from a cleared count must not survive it")
        XCTAssertEqual(model.field, .left)
    }

    func testClearingAddingKeepsTheCount() throws {
        try startCapture()
        model.type(4)

        model.clear(.adding)

        XCTAssertEqual(focusedLine?.remaining, 4)
        XCTAssertNil(focusedLine?.added)
        XCTAssertEqual(model.field, .adding)
    }

    // MARK: - Moving

    func testNextMovesToTheNeighbourAndResetsTheField() throws {
        try startCapture()
        model.type(4)
        model.toggleField()

        let reachedReview = model.advance()

        XCTAssertFalse(reachedReview)
        XCTAssertEqual(model.focus?.slotCode, "A2")
        XCTAssertEqual(model.field, .left, "a new slot always starts on LEFT")
    }

    /// The rolling loop from the spec: reach the end with a gap behind, jump
    /// to it, and the key is plain "Next" again — linear always, even onto
    /// counted slots. The lap ends at Review only from the end with no gaps.
    func testTheGapLapEndsAtReview() throws {
        try startCapture()
        model.type(4)              // A0 counted
        _ = model.advance()        // to A2, left uncounted
        _ = model.advance()        // to A4
        model.type(4)              // A4 counted

        // At the end with a gap behind: the one place the key changes meaning.
        XCTAssertTrue(model.hasGapsBehind)
        XCTAssertEqual(model.nextLabel, "Next gap")

        XCTAssertFalse(model.advance())
        XCTAssertEqual(model.focus?.slotCode, "A2")
        XCTAssertEqual(model.nextLabel, "Next", "once on the gap, linear again")

        model.type(4)              // the gap is filled
        XCTAssertFalse(model.advance(), "still walks to the neighbour, not Review")
        XCTAssertEqual(model.focus?.slotCode, "A4")
        XCTAssertTrue(model.advance(), "the end with no gaps left is Review")
    }

    func testNextWithEverythingCountedReachesReview() throws {
        try startCapture(slots: [["A0"]], planogrammed: ["A0"])
        model.type(4)

        XCTAssertTrue(model.advance())
    }

    func testTappingACellFocusesItOnTheLeftField() throws {
        try startCapture()
        model.toggleField()

        model.focusSlot(code: "A4")

        XCTAssertEqual(model.focus?.slotCode, "A4")
        XCTAssertEqual(model.field, .left)
    }

    func testTappingAnUnplanogrammedCellDoesNothing() throws {
        try startCapture(planogrammed: ["A0", "A4"])

        model.focusSlot(code: "A2")

        XCTAssertEqual(model.focus?.slotCode, "A0", "an empty cell holds nothing to focus")
    }

    // MARK: - Submitting

    func testSubmitQueuesTheVisit() throws {
        try startCapture()
        model.type(4)

        model.submit(context: context)

        XCTAssertEqual(
            try context.fetch(FetchDescriptor<OutboxItem>()).map(\.id),
            [model.draft?.clientRequestId].compactMap { $0 }
        )
    }
}
