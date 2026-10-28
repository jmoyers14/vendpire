import Foundation

/// A captured purchase in its wire shape — the write-path counterpart to
/// `Remote*`. The generated request type is touched only at the POST, so a
/// spec change is a compile error rather than a silent re-encode.
///
/// Also what `OutboxItem.payload` holds, which is why the coding strategy is
/// pinned below: the build that decodes a draft may not be the one that
/// wrote it.
nonisolated struct PurchaseSubmission: Codable, Equatable, Sendable {
    let purchasedAt: Date
    let vendor: String
    let lines: [PurchaseSubmissionLine]
    let packLines: [PurchaseSubmissionPackLine]
    let receiptTotalCents: Int?
    let notes: String?
    let clientRequestId: String
}

nonisolated struct PurchaseSubmissionLine: Codable, Equatable, Sendable {
    let productId: String
    let units: Int
    let totalCostCents: Int
    let packId: String?
}

nonisolated struct PurchaseSubmissionPackLine: Codable, Equatable, Sendable {
    let packId: String
    let qty: Int
    let totalCostCents: Int
}

extension PurchaseSubmission {
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
