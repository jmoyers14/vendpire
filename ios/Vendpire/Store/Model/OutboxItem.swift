import Foundation
import SwiftData

/// One pending submission. Stored rather than held, so a force-quit with rows
/// queued loses nothing — which is the entire reason the outbox exists.
///
/// Lives beside the mirrored entities in the same container but is not one of
/// them: observations move up and are never edited on the server, reference
/// data moves down and is never edited here.
///
/// Generic over `kind` from the start even though only visits are enqueued
/// today. Phase 9 adds a producer rather than migrating a table that by then
/// may hold a day of unsent field data.
@Model
final class OutboxItem {
    #Unique<OutboxItem>([\.id])

    /// The `clientRequestId`, minted at Start visit. An edited draft keeps it,
    /// so a twice-edited offline draft cannot double-post.
    var id: String = ""

    /// `visit` | `purchase`. Raw String for the same reason `Machine.kind` is:
    /// an unfamiliar value from a newer build must still load.
    var kind: String = "visit"

    /// When the observation was made, not when the row was written. Drain
    /// order, because sold units are derived from consecutive visits.
    var countedAt: Date = Date.distantPast

    var payload: Data = Data()

    /// Carried for migration, not for freezing — the draft is encoded from a
    /// struct at submit. See the 2026-10-24 outbox spec.
    var schemaVersion: Int = 1

    /// `queued` | `sending` | `sent` | `needsAttention`.
    var status: String = "queued"

    var attemptCount: Int = 0

    /// `.distantPast` means ready now. Non-optional on purpose: an optional
    /// date needs unwrapping inside `#Predicate`, which SwiftData handles
    /// poorly, and a nil-means-ready predicate is the kind that silently
    /// matches nothing.
    var nextAttemptAt: Date = Date.distantPast

    /// The server's words, shown to the operator verbatim.
    var lastMessage: String?

    init(
        id: String,
        kind: String = "visit",
        countedAt: Date,
        payload: Data,
        schemaVersion: Int = 1,
        status: String = "queued",
        attemptCount: Int = 0,
        nextAttemptAt: Date = .distantPast,
        lastMessage: String? = nil
    ) {
        self.id = id
        self.kind = kind
        self.countedAt = countedAt
        self.payload = payload
        self.schemaVersion = schemaVersion
        self.status = status
        self.attemptCount = attemptCount
        self.nextAttemptAt = nextAttemptAt
        self.lastMessage = lastMessage
    }
}

extension OutboxItem {
    /// Queued and out of backoff.
    ///
    /// Deliberately excludes `sending`: recovering a row orphaned by a
    /// force-quit mid-submit is the submitter's job at the top of a pass, where
    /// it can know no drain is in flight.
    static func eligible(asOf now: Date) -> Predicate<OutboxItem> {
        #Predicate { $0.status == "queued" && $0.nextAttemptAt <= now }
    }

    static let oldestFirst = [SortDescriptor(\OutboxItem.countedAt, order: .forward)]
}
