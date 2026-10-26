import XCTest

@testable import Vendpire

/// The order `Next` walks, and what the key does at each point.
///
/// Independent of how the screen looks: a grid, a table of one row per slot,
/// or anything else asks the same question — which slot is next.
final class CaptureOrderTests: XCTestCase {
    /// `National 148`: ragged, and the code convention changes partway down.
    /// Anything that parses codes to derive an order gets both wrong.
    private let national148: [[String]] = [
        ["A0", "A2", "A4", "A6"],
        ["B0", "B2", "B4", "B6"],
        ["C0", "C2", "C4", "C6"],
        ["D1", "D2", "D3", "D4", "D5", "D6", "D7"],
        ["E1", "E2", "E3", "E4", "E5", "E6", "E7"],
        ["F0", "F2", "F4", "F6"],
    ]

    private func planogram(_ slotCodes: [String]) -> [PlanogramSlot] {
        slotCodes.map {
            PlanogramSlot(slotCode: $0, productId: "p-\($0)", par: 10, priceCents: 100)
        }
    }

    private func key(_ slotCode: String) -> SlotKey {
        SlotKey(slotCode: slotCode, productId: "p-\(slotCode)")
    }

    private func order(_ slotCodes: [String]) -> CaptureOrder {
        CaptureOrder(slots: [slotCodes], planogramSlots: planogram(slotCodes))
    }

    // MARK: - Order

    func testTheOrderIsTheAuthoredLayoutFlattened() {
        let fullFace = national148.flatMap { $0 }
        let order = CaptureOrder(slots: national148, planogramSlots: planogram(fullFace))

        XCTAssertEqual(order.keys.map(\.slotCode), fullFace)
    }

    /// The guard against inferring order from the codes.
    ///
    /// `National 148` cannot show this: its shelves run A→F and its codes
    /// ascend within each, so sorting happens to reproduce the authored order
    /// exactly. That fixture discriminates on grid *shape*, not on sequence.
    /// A machine whose shelf is authored out of alphabetical order does.
    func testTheOrderIsNotWhatSortingTheCodesWouldGive() {
        let authored = ["A6", "A0", "A4", "A2"]
        let order = CaptureOrder(slots: [authored], planogramSlots: planogram(authored))

        XCTAssertEqual(order.keys.map(\.slotCode), authored)
        XCTAssertNotEqual(order.keys.map(\.slotCode), authored.sorted())
    }

    /// An empty cell has no product, so there is nothing in it to count.
    func testUnplanogrammedSlotsAreNotInTheOrder() {
        let order = CaptureOrder(
            slots: [["A0", "A2", "A4", "A6"]],
            planogramSlots: planogram(["A0", "A4"])
        )

        XCTAssertEqual(order.keys.map(\.slotCode), ["A0", "A4"])
    }

    func testTheLastKeyHasNothingAfterIt() {
        XCTAssertNil(order(["A0", "A2"]).slotAfter(key("A2")))
    }

    func testTheKeyAfterIsTheNextOneAuthored() {
        XCTAssertEqual(order(["A0", "A2", "A4"]).slotAfter(key("A2")), key("A4"))
    }

    /// A mixed spiral: the incoming product lands directly after the outgoing
    /// one, not at the end of the face.
    func testAnInsertedKeyLandsBesideItsSibling() {
        let spiral = SlotKey(slotCode: "A2", productId: "p-incoming")

        let widened = order(["A0", "A2", "A4"]).inserting(spiral, after: key("A2"))

        XCTAssertEqual(
            widened.keys,
            [key("A0"), key("A2"), spiral, key("A4")]
        )
    }

    // MARK: - Cursor

    private func cursor(
        _ slotCodes: [String],
        counted: [String],
        focus: String
    ) -> CaptureCursor {
        CaptureCursor(
            order: order(slotCodes),
            counted: Set(counted.map(key)),
            focus: key(focus)
        )
    }

    /// Linear always. Targeting the next *uncounted* slot would make the key
    /// teleport whenever you go back to fix something — which happens on most
    /// visits, because you learn you are short after moving on.
    func testNextGoesToTheNeighbourEvenWhenItIsAlreadyCounted() {
        let cursor = cursor(["A0", "A2", "A4"], counted: ["A2"], focus: "A0")

        XCTAssertEqual(cursor.nextDestination, .slot(key("A2")))
    }

    /// The revisit case from the spec: focus sits on a counted key mid-face
    /// with gaps further on. `Next` is still the neighbour.
    func testGoingBackToFixASlotDoesNotMakeNextJumpToAGap() {
        let cursor = cursor(
            ["A0", "A2", "B0", "B2", "C0"],
            counted: ["A0", "A2"],
            focus: "A0"
        )

        XCTAssertEqual(cursor.nextDestination, .slot(key("A2")))
    }

    /// A distinct case from `.slot`, because the key relabels to "Next gap"
    /// here — the one place it changes meaning says so on its face.
    func testAtTheEndOfTheFaceNextHuntsTheFirstGap() {
        let cursor = cursor(
            ["A0", "A2", "A4"],
            counted: ["A0", "A4"],
            focus: "A4"
        )

        XCTAssertEqual(cursor.nextDestination, .gap(key("A2")))
    }

    func testAtTheEndWithNothingLeftNextIsReview() {
        let cursor = cursor(["A0", "A2"], counted: ["A0", "A2"], focus: "A2")

        XCTAssertEqual(cursor.nextDestination, .review)
    }

    /// Authored order, not code order — the same rule as the grid.
    func testTheFirstGapFollowsTheAuthoredOrder() {
        let order = CaptureOrder(
            slots: [["A6", "A0", "A2"]],
            planogramSlots: planogram(["A6", "A0", "A2"])
        )
        let cursor = CaptureCursor(order: order, counted: [key("A6")], focus: key("A2"))

        XCTAssertEqual(cursor.firstUncountedSlot, key("A0"))
    }

    func testNoGapsMeansNoFirstGap() {
        XCTAssertNil(cursor(["A0"], counted: ["A0"], focus: "A0").firstUncountedSlot)
    }

    // MARK: - Fill to par

    func testFillingToParIsTheDifference() {
        XCTAssertEqual(unitsToFillPar(remaining: 4, par: 10), 6)
    }

    func testAnOverfullSlotNeedsNothingRatherThanANegative() {
        XCTAssertEqual(unitsToFillPar(remaining: 12, par: 10), 0)
    }

    /// No par and a fill of zero are different facts: one means "we do not
    /// know the target", the other means "it is already full".
    func testASlotWithNoParHasNoDefaultAtAll() {
        XCTAssertNil(unitsToFillPar(remaining: 4, par: nil))
    }
}
