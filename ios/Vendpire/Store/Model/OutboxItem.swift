import Foundation
import SwiftData

/// One pending submission, stored rather than held so a force-quit loses
/// nothing. The upward pipe — see `MirroredEntities.swift` for the other.
///
/// Generic over `kind` though only visits are enqueued today: Phase 9 adds a
/// producer rather than migrating a table holding unsent field data.
@Model
final class OutboxItem {
    #Unique<OutboxItem>([\.id])

    /// The `clientRequestId`. An edited draft keeps it, so it cannot double-post.
    var id: String = ""

    /// `visit` | `purchase`. Raw String like `Machine.kind`: an unfamiliar
    /// value from a newer build must still load.
    var kind: String = "visit"

    /// When the observation was made, not when the row was written. Drain
    /// order, because sold units derive from consecutive visits.
    var countedAt: Date = Date.distantPast

    var payload: Data = Data()

    /// For migration, not freezing: the payload is encoded from a struct.
    var schemaVersion: Int = 1

    /// `queued` | `sending` | `needsAttention`. There is no `sent`: success
    /// deletes the row, so reaching the server is the absence of one.
    var status: String = "queued"

    var attemptCount: Int = 0

    /// `.distantPast` means ready now. Non-optional because unwrapping inside
    /// `#Predicate` is how you get one that silently matches nothing.
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
    /// Queued and out of backoff. Excludes `sending` — reclaiming a row
    /// orphaned by a force-quit is the submitter's job at the top of a pass.
    static func eligible(asOf now: Date) -> Predicate<OutboxItem> {
        #Predicate { $0.status == "queued" && $0.nextAttemptAt <= now }
    }

    static let oldestFirst = [SortDescriptor(\OutboxItem.countedAt, order: .forward)]
}
