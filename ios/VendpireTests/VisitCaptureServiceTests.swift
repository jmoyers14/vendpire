import SwiftData
import XCTest

@testable import Vendpire

/// Starting, resuming and submitting a visit. Real SwiftData, no UI — the
/// screen drives this, it does not contain it.
@MainActor
final class VisitCaptureServiceTests: XCTestCase {
    private var context: ModelContext!
    private let now = Date(timeIntervalSince1970: 1_800_000_000)

    private func setUpStore() throws {
        context = ModelContext(try VendpireStore.makeInMemoryContainer())
    }

    private func makeService() -> VisitCaptureService {
        VisitCaptureService(context: context, now: { self.now })
    }

    @discardableResult
    private func insertMachine(
        id: String = "machine-1",
        slots: [[String]] = [["A0", "A2", "A4"]]
    ) -> StoredMachine {
        let machine = StoredMachine(
            id: id, locationId: "location-1", name: "National 148",
            kind: "snack", slots: slots
        )
        context.insert(machine)
        return machine
    }

    private func insertPlanogram(
        machineId: String = "machine-1",
        codes: [String] = ["A0", "A4"]
    ) {
        context.insert(
            StoredPlanogram(
                id: "pg-1",
                machineId: machineId,
                effectiveFrom: .distantPast,
                slots: codes.map {
                    PlanogramSlot(slotCode: $0, productId: "p-\($0)", par: 10, priceCents: 175)
                }
            )
        )
    }

    private func drafts() throws -> [VisitDraft] {
        try context.fetch(FetchDescriptor<VisitDraft>())
    }

    private func queue() throws -> [OutboxItem] {
        try context.fetch(FetchDescriptor<OutboxItem>())
    }

    // MARK: - Starting

    func testStartingAVisitMintsADraftStampedNow() throws {
        try setUpStore()
        let machine = insertMachine()
        insertPlanogram()

        let draft = try makeService().startVisit(at: machine)

        XCTAssertFalse(draft.clientRequestId.isEmpty)
        XCTAssertEqual(draft.countedAt, now)
        XCTAssertEqual(draft.machineId, "machine-1")
    }

    /// Snapshotted, not looked up later: the machine may be moved and the
    /// planogram repriced between counting and syncing.
    func testTheDraftSnapshotsWhereAndWhatItWasCountedAgainst() throws {
        try setUpStore()
        let machine = insertMachine()
        insertPlanogram()

        let draft = try makeService().startVisit(at: machine)

        XCTAssertEqual(draft.locationId, "location-1")
        XCTAssertEqual(draft.planogramId, "pg-1")
        XCTAssertEqual(draft.lines.first?.priceCents, 175)
        XCTAssertEqual(draft.lines.first?.par, 10)
    }

    /// One line per planogrammed slot, in authored order. An empty cell holds
    /// no product, so there is nothing in it to count.
    func testLinesCoverThePlanogrammedSlotsInAuthoredOrder() throws {
        try setUpStore()
        let machine = insertMachine(slots: [["A4", "A0", "A2"]])
        insertPlanogram(codes: ["A0", "A4"])

        let draft = try makeService().startVisit(at: machine)

        XCTAssertEqual(draft.lines.map(\.slotCode), ["A4", "A0"])
    }

    /// Nothing is pre-filled. A missing count is not a zero.
    func testEveryLineStartsUncounted() throws {
        try setUpStore()
        let machine = insertMachine()
        insertPlanogram()

        let draft = try makeService().startVisit(at: machine)

        XCTAssertTrue(draft.lines.allSatisfy { $0.remaining == nil && $0.added == nil })
    }

    func testReturningToTheMachineResumesTheSameDraft() throws {
        try setUpStore()
        let machine = insertMachine()
        insertPlanogram()
        let service = makeService()

        let first = try service.startVisit(at: machine)
        let second = try service.startVisit(at: machine)

        XCTAssertEqual(first.clientRequestId, second.clientRequestId)
        XCTAssertEqual(try drafts().count, 1)
    }

    /// An operator can service one machine twice before finding signal, so a
    /// submitted-but-undrained visit must not block a new one.
    func testASubmittedVisitDoesNotBlockStartingAnother() throws {
        try setUpStore()
        let machine = insertMachine()
        insertPlanogram()
        let service = makeService()

        let morning = try service.startVisit(at: machine)
        morning.lines[0].remaining = 3
        _ = try service.submit(morning)

        let afternoon = try service.startVisit(at: machine)

        XCTAssertNotEqual(afternoon.clientRequestId, morning.clientRequestId)
        XCTAssertEqual(try drafts().count, 2)
    }

    // MARK: - Submitting

    func testSubmittingQueuesTheVisitUnderTheDraftsOwnId() throws {
        try setUpStore()
        let machine = insertMachine()
        insertPlanogram()
        let service = makeService()
        let draft = try service.startVisit(at: machine)
        draft.lines[0].remaining = 3
        draft.lines[0].added = 7

        let queued = try service.submit(draft)

        XCTAssertTrue(queued)
        XCTAssertEqual(try queue().map(\.id), [draft.clientRequestId])
    }

    /// The drain deletes both on success. Until the server confirms, the
    /// draft is the operator's only copy.
    func testSubmittingKeepsTheDraftUntilItDrains() throws {
        try setUpStore()
        let machine = insertMachine()
        insertPlanogram()
        let service = makeService()
        let draft = try service.startVisit(at: machine)
        draft.lines[0].remaining = 0

        _ = try service.submit(draft)

        XCTAssertEqual(try drafts().count, 1)
    }

    /// The server rejects an empty `lines`, and finding that out after a drain
    /// means telling someone hours after they could have acted.
    func testSubmittingNothingCountedQueuesNothing() throws {
        try setUpStore()
        let machine = insertMachine()
        insertPlanogram()
        let service = makeService()
        let draft = try service.startVisit(at: machine)

        let queued = try service.submit(draft)

        XCTAssertFalse(queued)
        XCTAssertTrue(try queue().isEmpty)
    }

    func testAMachineWithNoPlanogramHasNothingToCount() throws {
        try setUpStore()
        let machine = insertMachine()

        let draft = try makeService().startVisit(at: machine)

        XCTAssertTrue(draft.lines.isEmpty)
        XCTAssertNil(draft.planogramId)
    }
}
