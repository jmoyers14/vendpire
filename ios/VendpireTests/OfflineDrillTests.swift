import SwiftData
import XCTest

@testable import Vendpire

/// The whole path in one test: count two machines with no network, reload the
/// store as a relaunch would, then drain.
///
/// Every other test here covers one component. This is the only one that would
/// catch two of them disagreeing — and the components were built days apart
/// against a spec, never against each other.
///
/// Not the field drill. A real drill needs a device, airplane mode and a
/// server; this proves the mechanism, not the radio.
@MainActor
final class OfflineDrillTests: XCTestCase {
    private var container: ModelContainer!

    private let morning = Date(timeIntervalSince1970: 1_800_000_000)
    private let afternoon = Date(timeIntervalSince1970: 1_800_021_600)

    private func setUpStore() throws {
        container = try VendpireStore.makeInMemoryContainer()
        let context = ModelContext(container)

        for (id, name) in [("machine-1", "National 148"), ("machine-2", "Small Machine")] {
            context.insert(
                StoredMachine(
                    id: id, locationId: "location-1", name: name,
                    kind: "snack", slots: [["A0", "A2"]]
                )
            )
            context.insert(
                StoredPlanogram(
                    id: "pg-\(id)", machineId: id, effectiveFrom: .distantPast,
                    slots: [
                        PlanogramSlot(slotCode: "A0", productId: "p-0", par: 10, priceCents: 175),
                        PlanogramSlot(slotCode: "A2", productId: "p-2", par: 8, priceCents: 150),
                    ]
                )
            )
        }
        try context.save()
    }

    private func machine(_ id: String, in context: ModelContext) throws -> StoredMachine {
        let machines = try context.fetch(FetchDescriptor<StoredMachine>())
        return try XCTUnwrap(machines.first { $0.id == id })
    }

    /// Counts one slot and submits, stamped at a chosen time so drain order is
    /// assertable.
    @discardableResult
    private func captureVisit(
        at machineId: String,
        countedAt: Date,
        in context: ModelContext
    ) throws -> String {
        let service = VisitCaptureService(context: context, now: { countedAt })
        let draft = try service.startVisit(at: try machine(machineId, in: context))
        draft.lines[0].remaining = 3
        draft.lines[0].added = 7
        XCTAssertTrue(try service.submit(draft))
        return draft.clientRequestId
    }

    func testTwoVisitsCapturedOfflineSurviveAReloadAndDrainOldestFirst() async throws {
        try setUpStore()

        // In the basement. The afternoon machine is counted first, so drain
        // order cannot accidentally match capture order.
        let offline = ModelContext(container)
        let later = try captureVisit(at: "machine-2", countedAt: afternoon, in: offline)
        let earlier = try captureVisit(at: "machine-1", countedAt: morning, in: offline)

        let api = StubOutboxAPI()
        api.onSubmit = { _ in .retryable }
        await OutboxSubmitter(api: api, context: offline, now: { self.afternoon }, jitter: { 1 }).drain()

        XCTAssertTrue(api.submitted.isEmpty || api.submitted.count == 1,
                      "a serial drain stops at the first retryable failure")
        XCTAssertEqual(try count(OutboxItem.self, in: offline), 2, "nothing is dropped offline")
        XCTAssertEqual(try count(VisitDraft.self, in: offline), 2)

        // Relaunch: a fresh context reading the same store. Anything held only
        // in memory is gone by here.
        let relaunched = ModelContext(container)
        XCTAssertEqual(try count(OutboxItem.self, in: relaunched), 2)

        // Signal returns.
        let online = StubOutboxAPI()
        await OutboxSubmitter(
            api: online,
            context: relaunched,
            now: { self.afternoon.addingTimeInterval(7200) },
            jitter: { 1 }
        ).drain()

        // Captured later-then-earlier, so insertion order and countedAt order
        // disagree. Sold units derive from consecutive visits, which is why
        // this has to be the latter.
        XCTAssertEqual(
            online.submitted, [earlier, later],
            "the queue drains by when it was counted, not when it was queued"
        )
        XCTAssertEqual(try count(OutboxItem.self, in: relaunched), 0, "the queue empties")
        XCTAssertEqual(try count(VisitDraft.self, in: relaunched), 0, "drafts go with them")
    }

    /// The payload the server would receive, assembled through the real path
    /// rather than hand-built.
    func testTheQueuedPayloadIsWhatWasCounted() throws {
        try setUpStore()
        let context = ModelContext(container)
        try captureVisit(at: "machine-1", countedAt: morning, in: context)

        let item = try XCTUnwrap(try context.fetch(FetchDescriptor<OutboxItem>()).first)
        let submission = try VisitSubmission.makeDecoder()
            .decode(VisitSubmission.self, from: item.payload)

        XCTAssertEqual(item.id, submission.clientRequestId)
        XCTAssertEqual(submission.machineId, "machine-1")
        XCTAssertEqual(submission.countedAt, morning)
        // Only A0 was counted. A2 emits no line at all.
        XCTAssertEqual(submission.lines.map(\.slotCode), ["A0"])
        XCTAssertEqual(submission.lines[0].remaining, 3)
        XCTAssertEqual(submission.lines[0].added, 7)
        XCTAssertEqual(submission.lines[0].priceCents, 175)
    }

    // MARK: - Helpers

    private func count<Model: PersistentModel>(
        _ type: Model.Type,
        in context: ModelContext
    ) throws -> Int {
        try context.fetch(FetchDescriptor<Model>()).count
    }
}
