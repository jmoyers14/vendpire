import Foundation

/// A captured visit in its wire shape — the write-path counterpart to
/// `Remote*`. The generated request type is touched only at the POST, so a
/// spec change is a compile error rather than a silent re-encode.
///
/// Also what `OutboxItem.payload` holds, which is why the coding strategy is
/// pinned below: the build that decodes a draft may not be the one that
/// wrote it.
nonisolated struct VisitSubmission: Codable, Equatable, Sendable {
    let machineId: String
    let locationId: String
    let planogramId: String?
    /// Stamped at Start visit — when the observations were made.
    let countedAt: Date
    /// At least one. The server rejects an empty list, so Submit refuses to
    /// enqueue a visit where nothing was counted.
    let lines: [VisitSubmissionLine]
    let notes: String?
    let clientRequestId: String
}

nonisolated struct VisitSubmissionLine: Codable, Equatable, Sendable {
    let slotCode: String
    let productId: String
    /// What was in the slot on arrival, BEFORE refilling. Never a "count".
    let remaining: Int
    let added: Int
    let removed: Int
    /// `expired` · `damaged` · `recalled` · `destocked` · `transferred`.
    /// A `String` so a value from a newer build still encodes; the picker
    /// constrains the choice.
    let removedReason: String?
    let priceCents: Int
    /// nil and 0 are different facts: no par set, versus a par of zero.
    let par: Int?
    let bestBy: String?
}

extension VisitSubmission {
    /// Pinned, not defaulted: a queued payload outlives the launch that wrote
    /// it, so a silent strategy change would orphan a draft.
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
