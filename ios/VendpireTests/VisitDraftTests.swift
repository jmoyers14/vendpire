import SwiftData
import XCTest

@testable import Vendpire

/// The draft, and the one conversion in the app where a mistake invents money.
///
/// Trap 3: an uncounted slot treated as zero books the leftover as sold, and
/// nothing downstream can detect it. The defence is emitting no line at all.
@MainActor
final class VisitDraftTests: XCTestCase {
    private var context: ModelContext!
    private let countedAt = Date(timeIntervalSince1970: 1_800_000_000)

    private func setUpStore() throws {
        context = ModelContext(try VendpireStore.makeInMemoryContainer())
    }

    private func line(
        _ slotCode: String,
        remaining: Int?,
        added: Int? = nil,
        removed: Int = 0,
        removedReason: String? = nil,
        priceCents: Int = 175,
        par: Int? = 10
    ) -> DraftLine {
        DraftLine(
            slotCode: slotCode,
            productId: "product-\(slotCode)",
            remaining: remaining,
            added: added,
            removed: removed,
            removedReason: removedReason,
            priceCents: priceCents,
            par: par,
            bestBy: nil
        )
    }

    private func makeDraft(lines: [DraftLine]) -> VisitDraft {
        let draft = VisitDraft(
            clientRequestId: "req-1",
            machineId: "machine-1",
            locationId: "location-1",
            planogramId: "planogram-1",
            countedAt: countedAt,
            lines: lines
        )
        context.insert(draft)
        return draft
    }

    /// The regression test that matters most in this phase.
    func testAnUncountedSlotEmitsNoLineAtAll() throws {
        try setUpStore()
        let draft = makeDraft(lines: [
            line("A0", remaining: 3, added: 7),
            line("A2", remaining: nil),
            line("A4", remaining: 0, added: 10),
        ])

        let submission = try XCTUnwrap(draft.makeSubmission())

        XCTAssertEqual(submission.lines.map(\.slotCode), ["A0", "A4"])
    }

    /// The sharp edge of the same rule: a counted zero is a real observation
    /// and must survive, while an uncounted slot beside it must not appear.
    func testACountedZeroIsNotTheSameAsAnUncountedSlot() throws {
        try setUpStore()
        let draft = makeDraft(lines: [
            line("A0", remaining: 0, added: 10),
            line("A2", remaining: nil),
        ])

        let submission = try XCTUnwrap(draft.makeSubmission())

        XCTAssertEqual(submission.lines.count, 1)
        XCTAssertEqual(submission.lines[0].slotCode, "A0")
        XCTAssertEqual(submission.lines[0].remaining, 0)
    }

    /// "You counted the slot and put nothing in it" is a real observation.
    func testACountedSlotWithNothingAddedSubmitsAsZero() throws {
        try setUpStore()
        let draft = makeDraft(lines: [line("A0", remaining: 4, added: nil)])

        let submission = try XCTUnwrap(draft.makeSubmission())

        XCTAssertEqual(submission.lines[0].added, 0)
    }

    /// The server rejects an empty `lines`, which would land in needsAttention
    /// long after the operator walked away. Refuse it here instead.
    func testADraftWithNothingCountedCannotBeSubmitted() throws {
        try setUpStore()
        let draft = makeDraft(lines: [line("A0", remaining: nil), line("A2", remaining: nil)])

        XCTAssertNil(draft.makeSubmission())
    }

    func testTheSubmissionCarriesTheSnapshotTakenAtStartVisit() throws {
        try setUpStore()
        let draft = makeDraft(lines: [
            line("A0", remaining: 3, added: 7, removed: 2, removedReason: "expired", priceCents: 325, par: 8)
        ])

        let submission = try XCTUnwrap(draft.makeSubmission())

        XCTAssertEqual(submission.machineId, "machine-1")
        XCTAssertEqual(submission.locationId, "location-1")
        XCTAssertEqual(submission.planogramId, "planogram-1")
        XCTAssertEqual(submission.clientRequestId, "req-1")
        XCTAssertEqual(submission.countedAt, countedAt)

        let emitted = submission.lines[0]
        XCTAssertEqual(emitted.productId, "product-A0")
        XCTAssertEqual(emitted.remaining, 3)
        XCTAssertEqual(emitted.added, 7)
        XCTAssertEqual(emitted.removed, 2)
        XCTAssertEqual(emitted.removedReason, "expired")
        XCTAssertEqual(emitted.priceCents, 325)
        XCTAssertEqual(emitted.par, 8)
    }

    /// Identity is minted at birth, so no draft can exist without one. An
    /// empty `#Unique` field would let two id-less drafts collide into one.
    func testADraftMintsItsOwnRequestId() throws {
        try setUpStore()

        let draft = VisitDraft(
            machineId: "machine-1", locationId: "location-1",
            planogramId: nil, countedAt: countedAt
        )

        XCTAssertFalse(draft.clientRequestId.isEmpty)
    }

    func testTwoDraftsNeverShareAMintedId() throws {
        try setUpStore()

        let first = VisitDraft(
            machineId: "machine-1", locationId: "location-1",
            planogramId: nil, countedAt: countedAt
        )
        let second = VisitDraft(
            machineId: "machine-1", locationId: "location-1",
            planogramId: nil, countedAt: countedAt
        )

        XCTAssertNotEqual(first.clientRequestId, second.clientRequestId)
    }

    /// An operator can service the same machine twice before finding signal,
    /// so uniqueness is on the request id, not the machine.
    func testTwoDraftsForOneMachineCanCoexist() throws {
        try setUpStore()
        context.insert(VisitDraft(
            clientRequestId: "morning", machineId: "machine-1",
            locationId: "location-1", planogramId: nil,
            countedAt: countedAt, lines: []
        ))
        context.insert(VisitDraft(
            clientRequestId: "afternoon", machineId: "machine-1",
            locationId: "location-1", planogramId: nil,
            countedAt: countedAt.addingTimeInterval(3600), lines: []
        ))
        try context.save()

        XCTAssertEqual(try context.fetch(FetchDescriptor<VisitDraft>()).count, 2)
    }
}
