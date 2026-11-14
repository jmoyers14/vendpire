import Foundation

/// A captured purchase in its wire shape — the write-path counterpart to
/// `Remote*`. The generated request type is touched only at the POST, so a
/// spec change is a compile error rather than a silent re-encode.
nonisolated struct PurchaseSubmission: OutboxPayload, Equatable, Sendable {
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
