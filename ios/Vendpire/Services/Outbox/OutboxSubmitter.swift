import Foundation
import SwiftData

/// Drains the outbox: serial, oldest observation first, stopping at the first
/// retryable failure.
///
/// The invariant every path preserves is that a row leaves the queue on
/// success and no other way.
@MainActor
@Observable
final class OutboxSubmitter {
    enum State: Equatable {
        case idle
        case draining
    }

    private(set) var state: State = .idle

    private let api: OutboxSubmitting
    private let context: ModelContext
    private let now: () -> Date
    private let jitter: () -> Double

    init(
        api: OutboxSubmitting,
        context: ModelContext,
        now: @escaping () -> Date = Date.init,
        jitter: @escaping () -> Double = { Double.random(in: 0...1) }
    ) {
        self.api = api
        self.context = context
        self.now = now
        self.jitter = jitter
    }

    func drain() async {
        // Launch and foreground fire within milliseconds, same as the mirror.
        guard state != .draining else { return }
        state = .draining
        defer { state = .idle }

        reclaimOrphans()

        while let item = nextEligible() {
            item.status = "sending"
            let outcome = await api.submit(
                OutboxRequest(kind: item.kind, clientRequestId: item.id, payload: item.payload)
            )

            switch outcome {
            case .accepted:
                deleteWithDraft(item)
            case .permanent(let message):
                item.status = "needsAttention"
                item.lastMessage = message
            case .retryable, .unauthorized, .noOrganization, .blockedByUpdateFloor:
                scheduleRetry(item)
                save()
                // Stop rather than skip ahead: submitting N+1 before N trips
                // the server's out-of-order path for nothing.
                return
            }
            save()
        }
    }

    /// The draft goes with the row: while both exist the face reads "waiting
    /// to sync", so one left behind would look like a fresh open visit.
    ///
    /// Drafts are known by id, never by shape — a purchase has none and this
    /// is a no-op.
    private func deleteWithDraft(_ item: OutboxItem) {
        let requestId = item.id
        let drafts = (try? context.fetch(
            FetchDescriptor<VisitDraft>(
                predicate: #Predicate { $0.clientRequestId == requestId }
            )
        )) ?? []

        for draft in drafts {
            context.delete(draft)
        }
        context.delete(item)
    }

    /// Sends a `needsAttention` row back through the machine — the operator
    /// has decided the cause is fixed. Re-queues eligible-now and drains in
    /// one move: a retry that waits for the next tick reads as a dead button.
    func retry(_ item: OutboxItem) async {
        item.status = "queued"
        item.nextAttemptAt = .distantPast
        save()
        await drain()
    }

    /// A force-quit mid-submit leaves a row reading `sending` that nothing
    /// else would ever look at again.
    ///
    /// Correct only because the coalescing guard means no other pass is
    /// running. A second concurrent drain would reclaim rows mid-flight and
    /// double-submit them — absorbed by idempotency, but the guard is
    /// load-bearing and not obviously so.
    private func reclaimOrphans() {
        let orphans = (try? context.fetch(
            FetchDescriptor<OutboxItem>(predicate: #Predicate { $0.status == "sending" })
        )) ?? []

        for orphan in orphans {
            orphan.status = "queued"
        }
        save()
    }

    /// Re-queried rather than snapshotted, so a submit landing mid-drain is
    /// picked up here instead of waiting out a tick.
    private func nextEligible() -> OutboxItem? {
        var descriptor = FetchDescriptor<OutboxItem>(
            predicate: OutboxItem.eligible(asOf: now()),
            sortBy: OutboxItem.oldestFirst
        )
        descriptor.fetchLimit = 1
        return try? context.fetch(descriptor).first
    }

    private func scheduleRetry(_ item: OutboxItem) {
        item.attemptCount += 1
        item.status = "queued"
        item.nextAttemptAt = now().addingTimeInterval(
            backoffDelay(attemptCount: item.attemptCount, jitter: jitter())
        )
    }

    /// A failed save leaves the row right in memory but not on disk, and the
    /// next launch reclaims anything stuck mid-flight. Nothing to unwind.
    private func save() {
        try? context.save()
    }
}
