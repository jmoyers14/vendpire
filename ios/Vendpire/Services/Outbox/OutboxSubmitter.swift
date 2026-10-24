import Foundation
import SwiftData

/// Drains the outbox: serial, oldest observation first, stopping at the first
/// failure worth retrying.
///
/// The one invariant every path here preserves is that a row leaves the queue
/// on success and no other way. Nothing deletes on error, nothing expires, and
/// nothing is dropped to keep the queue tidy.
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
        // Launch and foreground fire this within milliseconds of each other,
        // same as the mirror's.
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

    /// Success is the one exit, and it leaves nothing behind: the server is
    /// the record of what synced, and a table of sent rows grows without bound.
    ///
    /// The draft goes with it. While both exist the face reads "waiting to
    /// sync"; a draft left behind would read as a fresh open visit at a machine
    /// that was already counted. The queue knows drafts exist by id and never
    /// by shape — a purchase has none, and the delete is simply a no-op.
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

    /// A force-quit mid-submit leaves a row reading `sending` with no drain in
    /// flight. The top of a pass is the one place that can know that, because
    /// the coalescing guard means no other pass is running.
    ///
    /// That makes this correct by two pieces of code agreeing rather than by
    /// the type system. A second concurrent drain — a background task, say —
    /// would reclaim rows another pass is mid-flight on and submit them twice.
    /// Idempotency on `clientRequestId` absorbs it server-side, so the blast
    /// radius is small, but the guard is load-bearing and not obviously so.
    private func reclaimOrphans() {
        let orphans = (try? context.fetch(
            FetchDescriptor<OutboxItem>(predicate: #Predicate { $0.status == "sending" })
        )) ?? []

        for orphan in orphans {
            orphan.status = "queued"
        }
        save()
    }

    /// Re-queried each pass rather than snapshotted, so a submit that lands
    /// mid-drain is picked up here instead of waiting out a tick behind the
    /// guard that just rejected its own `drain()` call.
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

    /// A failed local save leaves the row correct in memory but not on disk.
    /// The next launch re-reads the store and `reclaimOrphans` picks up
    /// anything stuck mid-flight, so there is no state worth unwinding here.
    private func save() {
        try? context.save()
    }
}
