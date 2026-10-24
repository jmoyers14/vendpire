import Foundation

/// What the queue needs from the network, and nothing more.
///
/// Deliberately narrower than `VendpireAPI`: a drain has no business with
/// `fetchLocations`, and keeping the payload opaque means the queue never
/// learns what a visit is. Phase 9 adds a `kind` without touching this.
/// `@MainActor` because the queue it serves is a SwiftData context, and the
/// project enables `NonisolatedNonsendingByDefault` — without this the
/// requirement would be non-isolated and could not touch the store. Differs
/// from `VendpireAPI`, which is `Sendable` because the mirror's reads have no
/// such tie.
@MainActor
protocol OutboxSubmitting {
    func submit(_ request: OutboxRequest) async -> SubmitOutcome
}

/// One attempt's worth of request.
///
/// `payload` is **our own** `Codable` shape, not the generated wire type.
/// Decoding it and mapping to the generated request happens at the network
/// edge, which is what keeps a spec change a compile error in one known file
/// rather than a silent re-encode of a draft captured days ago.
nonisolated struct OutboxRequest: Equatable, Sendable {
    let kind: String
    let clientRequestId: String
    let payload: Data
}
