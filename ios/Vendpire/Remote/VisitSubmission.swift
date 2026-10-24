import Foundation

/// A captured visit in its wire shape — the write-path counterpart to
/// `Remote*`. The generated request type is touched only at the POST, so a
/// spec change is a compile error in the mapping rather than a silent
/// re-encode of a draft captured days ago.
///
/// This is also what `OutboxItem.payload` holds, which is why the coding
/// strategy is pinned below instead of left to `JSONEncoder`'s defaults: the
/// build that decodes a queued draft may not be the build that wrote it.
nonisolated struct VisitSubmission: Codable, Equatable, Sendable {
    let machineId: String
    let locationId: String
    let planogramId: String?
    /// Stamped at Start visit — when the observations were made.
    let countedAt: Date
    /// The server requires at least one. A visit where nothing was counted is
    /// rejected, so Submit refuses to enqueue one.
    let lines: [VisitSubmissionLine]
    let notes: String?
    let clientRequestId: String
}

nonisolated struct VisitSubmissionLine: Codable, Equatable, Sendable {
    let slotCode: String
    let productId: String
    /// What was in the slot on arrival, BEFORE refilling. Never a "count" —
    /// nothing downstream can detect a violation of that.
    let remaining: Int
    let added: Int
    let removed: Int
    /// `expired` · `damaged` · `recalled` · `destocked` · `transferred`.
    /// A `String` rather than an enum so a value from a newer build still
    /// encodes; the picker is what constrains the choice.
    let removedReason: String?
    let priceCents: Int
    /// nil and 0 are different facts: no par set, versus a par of zero.
    let par: Int?
    let bestBy: String?
}

extension VisitSubmission {
    /// Pinned rather than defaulted. A queued payload outlives the launch that
    /// wrote it, so an implicit strategy change between builds would mean a
    /// draft that no longer parses.
    static func makeEncoder() -> JSONEncoder {
        let encoder = JSONEncoder()
        encoder.dateEncodingStrategy = .iso8601
        return encoder
    }

    static func makeDecoder() -> JSONDecoder {
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        return decoder
    }
}
