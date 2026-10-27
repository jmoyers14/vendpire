import SwiftData
import XCTest

@testable import Vendpire

/// Real SwiftData, stubbed network. Every case here is one where a day of
/// counts could go missing, so the standing assertion in all of them is that
/// the row count never drops except on success.
@MainActor
final class OutboxSubmitterTests: XCTestCase {
    private var context: ModelContext!
    private var api: StubOutboxAPI!

    private let now = Date(timeIntervalSince1970: 1_800_000_000)

    private func setUpStore() throws {
        context = ModelContext(try VendpireStore.makeInMemoryContainer())
        api = StubOutboxAPI()
    }

    private func makeSubmitter() -> OutboxSubmitter {
        OutboxSubmitter(api: api, context: context, now: { self.now }, jitter: { 1 })
    }

    @discardableResult
    private func insert(
        id: String,
        status: String = "queued",
        countedAt: TimeInterval,
        nextAttemptAt: Date = .distantPast
    ) -> OutboxItem {
        let item = OutboxItem(
            id: id,
            countedAt: Date(timeIntervalSince1970: countedAt),
            payload: Data("{}".utf8),
            status: status,
            nextAttemptAt: nextAttemptAt
        )
        context.insert(item)
        return item
    }

    private func item(_ id: String) throws -> OutboxItem {
        let all = try context.fetch(FetchDescriptor<OutboxItem>())
        return try XCTUnwrap(all.first { $0.id == id })
    }

    private func rowCount() throws -> Int {
        try context.fetch(FetchDescriptor<OutboxItem>()).count
    }

    /// Success is the one exit from the queue, and it leaves nothing behind:
    /// the server is the record of what synced, and a table of sent rows grows
    /// without bound.
    func testASuccessfulSubmitRemovesTheRow() async throws {
        try setUpStore()
        insert(id: "a", countedAt: 100)

        await makeSubmitter().drain()

        XCTAssertEqual(try rowCount(), 0)
    }

    /// The draft and its queue row have to go together. While both exist the
    /// face reads "waiting to sync"; a draft left behind would read as a fresh
    /// open visit at a machine that was already counted.
    func testSuccessRemovesTheDraftAlongsideTheRow() async throws {
        try setUpStore()
        insert(id: "req-1", countedAt: 100)
        context.insert(
            VisitDraft(
                clientRequestId: "req-1",
                machineId: "machine-1",
                locationId: "location-1",
                planogramId: nil,
                countedAt: Date(timeIntervalSince1970: 100)
            )
        )

        await makeSubmitter().drain()

        XCTAssertEqual(try context.fetch(FetchDescriptor<VisitDraft>()).count, 0)
    }

    /// A purchase has no draft. The delete must be a no-op, not a crash.
    func testARowWithNoDraftStillCompletes() async throws {
        try setUpStore()
        insert(id: "orphaned-row", countedAt: 100)

        await makeSubmitter().drain()

        XCTAssertEqual(try rowCount(), 0)
    }

    /// Failure still leaves the draft alone — it is the operator's only copy.
    func testAFailedSubmitKeepsTheDraft() async throws {
        try setUpStore()
        insert(id: "req-1", countedAt: 100)
        context.insert(
            VisitDraft(
                clientRequestId: "req-1",
                machineId: "machine-1",
                locationId: "location-1",
                planogramId: nil,
                countedAt: Date(timeIntervalSince1970: 100)
            )
        )
        api.onSubmit = { _ in .permanent(message: "rejected") }

        await makeSubmitter().drain()

        XCTAssertEqual(try context.fetch(FetchDescriptor<VisitDraft>()).count, 1)
        XCTAssertEqual(try rowCount(), 1)
    }

    func testTheQueueDrainsOldestObservationFirst() async throws {
        try setUpStore()
        insert(id: "late", countedAt: 300)
        insert(id: "early", countedAt: 100)
        insert(id: "middle", countedAt: 200)

        await makeSubmitter().drain()

        XCTAssertEqual(api.submitted, ["early", "middle", "late"])
    }

    /// Sending N+1 before N trips the server's out-of-order path for nothing.
    func testARetryableFailureStopsThePassInsteadOfSkippingAhead() async throws {
        try setUpStore()
        insert(id: "first", countedAt: 100)
        insert(id: "second", countedAt: 200)
        api.onSubmit = { _ in .retryable }

        await makeSubmitter().drain()

        XCTAssertEqual(api.submitted, ["first"])
        XCTAssertEqual(try item("second").status, "queued")
        XCTAssertEqual(try item("second").attemptCount, 0)
    }

    func testAServerFaultSchedulesARetryRatherThanGivingUp() async throws {
        try setUpStore()
        insert(id: "a", countedAt: 100)
        api.onSubmit = { _ in .retryable }

        await makeSubmitter().drain()

        let row = try item("a")
        XCTAssertEqual(row.status, "queued")
        XCTAssertEqual(row.attemptCount, 1)
        XCTAssertGreaterThan(row.nextAttemptAt, now)
        XCTAssertEqual(try rowCount(), 1)
    }

    func testRejectedInputNeedsAttentionAndKeepsTheServersWords() async throws {
        try setUpStore()
        insert(id: "a", countedAt: 100)
        api.onSubmit = { _ in .permanent(message: "countedAt is in the future") }

        await makeSubmitter().drain()

        let row = try item("a")
        XCTAssertEqual(row.status, "needsAttention")
        XCTAssertEqual(row.lastMessage, "countedAt is in the future")
        XCTAssertEqual(try rowCount(), 1)
    }

    /// The version floor must never strand a draft.
    func testBeingBelowTheVersionFloorKeepsTheRowQueued() async throws {
        try setUpStore()
        insert(id: "a", countedAt: 100)
        api.onSubmit = { _ in .blockedByUpdateFloor }

        await makeSubmitter().drain()

        XCTAssertEqual(try item("a").status, "queued")
        XCTAssertEqual(try rowCount(), 1)
    }

    func testARowStillInBackoffIsNotAttempted() async throws {
        try setUpStore()
        insert(id: "waiting", countedAt: 100, nextAttemptAt: now.addingTimeInterval(60))

        await makeSubmitter().drain()

        XCTAssertTrue(api.submitted.isEmpty)
    }

    /// The idempotency proof force-quits mid-submit. On relaunch that row reads
    /// `sending` with no drain in flight, and if nothing reclaims it the counts
    /// are stranded forever — which is the one thing this queue exists to stop.
    func testARowOrphanedByAForceQuitIsReclaimed() async throws {
        try setUpStore()
        insert(id: "orphan", status: "sending", countedAt: 100)

        await makeSubmitter().drain()

        XCTAssertEqual(api.submitted, ["orphan"])
        XCTAssertEqual(try rowCount(), 0)
    }

    /// A submit landing mid-drain must not wait for the next tick: its own
    /// drain() call is rejected by the coalescing guard, so the running pass
    /// has to notice it.
    func testARowEnqueuedMidDrainIsPickedUpInTheSamePass() async throws {
        try setUpStore()
        insert(id: "first", countedAt: 100)
        var inserted = false
        api.onSubmit = { [weak self] _ in
            guard let self, !inserted else { return .accepted }
            inserted = true
            self.insert(id: "arrived-late", countedAt: 200)
            return .accepted
        }

        await makeSubmitter().drain()

        XCTAssertEqual(api.submitted, ["first", "arrived-late"])
    }

    /// The needsAttention escape hatch: a person decides the cause is fixed
    /// and sends the row back through the machine. Retry re-queues and drains
    /// in one move — a retry that waits for the next tick reads as a dead
    /// button.
    func testRetryRequeuesAndDrainsImmediately() async throws {
        try setUpStore()
        let item = insert(id: "stuck", status: "needsAttention", countedAt: 100)
        item.lastMessage = "no such machine"

        await makeSubmitter().retry(item)

        XCTAssertEqual(api.submitted, ["stuck"], "the drain ran without waiting for a tick")
        XCTAssertEqual(try rowCount(), 0, "accepted on retry, so the row is gone")
    }

    func testARetryThatFailsAgainLandsBackInNeedsAttention() async throws {
        try setUpStore()
        insert(id: "still-stuck", status: "needsAttention", countedAt: 100)
        api.onSubmit = { _ in .permanent(message: "still no such machine") }

        let item = try item("still-stuck")
        await makeSubmitter().retry(item)

        XCTAssertEqual(item.status, "needsAttention")
        XCTAssertEqual(item.lastMessage, "still no such machine")
        XCTAssertEqual(try rowCount(), 1)
    }

    func testNoFailureEverDeletesARow() async throws {
        for outcome in [SubmitOutcome.retryable, .unauthorized, .noOrganization,
                        .blockedByUpdateFloor, .permanent(message: "bad")] {
            try setUpStore()
            insert(id: "a", countedAt: 100)
            api.onSubmit = { _ in outcome }

            await makeSubmitter().drain()

            XCTAssertEqual(try rowCount(), 1, "\(outcome) must not delete the row")
        }
    }
}

/// Stand-in for the write edge. Records what it was asked to send so ordering
/// can be asserted, which is the property the server's out-of-order path cares
/// about.
@MainActor
final class StubOutboxAPI: OutboxSubmitting {
    var onSubmit: @MainActor (OutboxRequest) async -> SubmitOutcome = { _ in .accepted }
    private(set) var submitted: [String] = []

    func submit(_ request: OutboxRequest) async -> SubmitOutcome {
        submitted.append(request.clientRequestId)
        return await onSubmit(request)
    }
}
