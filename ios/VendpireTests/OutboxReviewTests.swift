import XCTest

@testable import Vendpire

/// What the outbox screen shows. Pure join: the queue row is opaque by design,
/// so the machine's name comes from the draft that survives beside it.
final class OutboxReviewTests: XCTestCase {
    private func item(
        _ id: String,
        kind: String = "visit",
        countedAt: TimeInterval,
        status: String = "queued",
        attemptCount: Int = 0,
        lastMessage: String? = nil
    ) -> OutboxItem {
        OutboxItem(
            id: id, kind: kind,
            countedAt: Date(timeIntervalSince1970: countedAt),
            payload: Data(), status: status,
            attemptCount: attemptCount, lastMessage: lastMessage
        )
    }

    private func draft(_ requestId: String, machineId: String) -> VisitDraft {
        VisitDraft(
            clientRequestId: requestId, machineId: machineId,
            locationId: "location-1", planogramId: nil,
            countedAt: .distantPast
        )
    }

    func testARowNamesItsMachineThroughTheDraft() {
        let rows = OutboxReviewRow.rows(
            items: [item("req-1", countedAt: 100)],
            drafts: [draft("req-1", machineId: "machine-1")],
            machineNames: ["machine-1": "National 148"]
        )

        XCTAssertEqual(rows.first?.title, "National 148")
    }

    /// A purchase has no draft, and a draft can outlive its machine in the
    /// mirror. Neither may blank the row — the queue is the operator's only
    /// view of work that has not reached the server.
    func testARowWithNoDraftStillSaysWhatItIs() {
        let rows = OutboxReviewRow.rows(
            items: [item("req-1", kind: "purchase", countedAt: 100)],
            drafts: [],
            machineNames: [:]
        )

        XCTAssertEqual(rows.first?.title, "Purchase")
    }

    func testOldestObservationFirst_TheSameOrderTheDrainUses() {
        let rows = OutboxReviewRow.rows(
            items: [item("late", countedAt: 300), item("early", countedAt: 100)],
            drafts: [],
            machineNames: [:]
        )

        XCTAssertEqual(rows.map(\.id), ["early", "late"])
    }

    /// The split the screen is built around: rows a timer will fix, and rows
    /// only a person can.
    func testNeedsAttentionIsSeparatedFromPending() {
        let rows = OutboxReviewRow.rows(
            items: [
                item("stuck", countedAt: 100, status: "needsAttention", lastMessage: "no such machine"),
                item("waiting", countedAt: 200),
            ],
            drafts: [],
            machineNames: [:]
        )

        XCTAssertEqual(rows.filter(\.needsAttention).map(\.id), ["stuck"])
        XCTAssertEqual(rows.first { $0.needsAttention }?.message, "no such machine")
    }

    func testAPendingRowDescribesWhereItIsInTheRetryLoop() {
        let rows = OutboxReviewRow.rows(
            items: [
                item("fresh", countedAt: 100),
                item("retrying", countedAt: 200, attemptCount: 3),
            ],
            drafts: [],
            machineNames: [:]
        )

        XCTAssertEqual(rows[0].detail, "waiting to sync")
        XCTAssertEqual(rows[1].detail, "3 attempts so far")
    }

    func testASingleAttemptIsSingular() {
        let rows = OutboxReviewRow.rows(
            items: [item("once", countedAt: 100, attemptCount: 1)],
            drafts: [],
            machineNames: [:]
        )

        XCTAssertEqual(rows.first?.detail, "1 attempt so far")
    }
}
