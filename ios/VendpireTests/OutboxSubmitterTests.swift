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

    func testASuccessfulSubmitMarksTheRowSent() async throws {
        try setUpStore()
        insert(id: "a", countedAt: 100)

        await makeSubmitter().drain()

        XCTAssertEqual(try item("a").status, "sent")
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
        XCTAssertEqual(try item("orphan").status, "sent")
    }

    /// A submit landing mid-drain must not wait for the next tick: its own
    /// drain() call is rejected by the coalescing guard, so the running pass
    /// has to notice it.
    func testARowEnqueuedMidDrainIsPickedUpInTheSamePass() async throws {
        try setUpStore()
        insert(id: "first", countedAt: 100)
        var inserted = false
        api.onSubmit = { [weak self] _ in
            guard let self, !inserted else { return .accepted(visitId: "v") }
            inserted = true
            self.insert(id: "arrived-late", countedAt: 200)
            return .accepted(visitId: "v")
        }

        await makeSubmitter().drain()

        XCTAssertEqual(api.submitted, ["first", "arrived-late"])
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
    var onSubmit: @MainActor (OutboxRequest) async -> SubmitOutcome = { _ in .accepted(visitId: "v-1") }
    private(set) var submitted: [String] = []

    func submit(_ request: OutboxRequest) async -> SubmitOutcome {
        submitted.append(request.clientRequestId)
        return await onSubmit(request)
    }
}
