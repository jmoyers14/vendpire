import SwiftData
import XCTest

@testable import Vendpire

/// The queue's storage contract. These run against a real in-memory SwiftData
/// stack because the failures worth catching are SwiftData's: a predicate that
/// silently matches nothing leaves a day's counts unsent with no symptom.
@MainActor
final class OutboxItemTests: XCTestCase {
    private var context: ModelContext!

    private let now = Date(timeIntervalSince1970: 1_800_000_000)

    private func setUpStore() throws {
        context = ModelContext(try VendpireStore.makeInMemoryContainer())
    }

    private func insert(
        id: String,
        status: String = "queued",
        countedAt: Date = Date(timeIntervalSince1970: 1_700_000_000),
        nextAttemptAt: Date = .distantPast
    ) {
        context.insert(
            OutboxItem(
                id: id,
                kind: "visit",
                countedAt: countedAt,
                payload: Data("{}".utf8),
                status: status,
                nextAttemptAt: nextAttemptAt
            )
        )
    }

    private func eligibleIds() throws -> [String] {
        let found = try context.fetch(
            FetchDescriptor<OutboxItem>(
                predicate: OutboxItem.eligible(asOf: now),
                sortBy: OutboxItem.oldestFirst
            )
        )
        return found.map(\.id)
    }

    func testAQueuedRowWhoseBackoffHasPassedIsEligible() throws {
        try setUpStore()
        insert(id: "a", nextAttemptAt: now.addingTimeInterval(-1))

        XCTAssertEqual(try eligibleIds(), ["a"])
    }

    func testARowStillInBackoffIsSkippedRatherThanRetriedEarly() throws {
        try setUpStore()
        insert(id: "waiting", nextAttemptAt: now.addingTimeInterval(60))

        XCTAssertTrue(try eligibleIds().isEmpty)
    }

    /// `sent` is the only exit. It must never be picked up again — a resubmit
    /// is harmless server-side, but re-sending forever is not a drain.
    func testASentRowIsNeverPickedUpAgain() throws {
        try setUpStore()
        insert(id: "done", status: "sent")

        XCTAssertTrue(try eligibleIds().isEmpty)
    }

    /// Permanent failures wait for a person, not for a timer.
    func testANeedsAttentionRowDoesNotRetryOnItsOwn() throws {
        try setUpStore()
        insert(id: "rejected", status: "needsAttention")

        XCTAssertTrue(try eligibleIds().isEmpty)
    }

    /// A row mid-flight is not eligible. Recovering one orphaned by a
    /// force-quit is the submitter's job, not the predicate's.
    func testARowAlreadySendingIsNotPickedUpConcurrently() throws {
        try setUpStore()
        insert(id: "inflight", status: "sending")

        XCTAssertTrue(try eligibleIds().isEmpty)
    }

    /// Visits are an ordered sequence and sold units are derived from
    /// consecutive ones, so the queue drains by observation time.
    func testTheQueueDrainsOldestObservationFirst() throws {
        try setUpStore()
        insert(id: "third", countedAt: Date(timeIntervalSince1970: 300))
        insert(id: "first", countedAt: Date(timeIntervalSince1970: 100))
        insert(id: "second", countedAt: Date(timeIntervalSince1970: 200))

        XCTAssertEqual(try eligibleIds(), ["first", "second", "third"])
    }

    /// Enqueuing derives the row id and `countedAt` from the payload, so the
    /// two copies of each cannot disagree. A mismatch would submit under one
    /// id and delete the draft by another — leaving a draft that looks open
    /// and resubmits as a second visit for the same count.
    func testEnqueuingDerivesTheRowFromThePayload() throws {
        try setUpStore()
        let submission = VisitSubmission(
            machineId: "machine-1",
            locationId: "location-1",
            planogramId: nil,
            countedAt: Date(timeIntervalSince1970: 500),
            lines: [
                VisitSubmissionLine(
                    slotCode: "A0", productId: "p-0", remaining: 1, added: 2,
                    removed: 0, removedReason: nil, priceCents: 100,
                    par: nil, bestBy: nil
                )
            ],
            notes: nil,
            clientRequestId: "req-from-payload"
        )

        let item = try OutboxItem(visit: submission)

        XCTAssertEqual(item.id, "req-from-payload")
        XCTAssertEqual(item.countedAt, Date(timeIntervalSince1970: 500))
        XCTAssertEqual(item.kind, "visit")
        XCTAssertEqual(
            try VisitSubmission.makeDecoder().decode(VisitSubmission.self, from: item.payload),
            submission
        )
    }

    /// `id` is the clientRequestId. A second write under the same id is the
    /// same visit being re-saved, and must upsert rather than queue twice.
    func testTheSameClientRequestIdCannotQueueTwice() throws {
        try setUpStore()
        insert(id: "same")
        insert(id: "same")
        try context.save()

        XCTAssertEqual(try context.fetch(FetchDescriptor<OutboxItem>()).count, 1)
    }
}
