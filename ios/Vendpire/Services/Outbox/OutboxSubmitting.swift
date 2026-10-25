import Foundation

/// What the queue needs from the network, and nothing more. Keeping the
/// payload opaque is what stops it learning what a visit is.
///
/// `@MainActor` because it serves a SwiftData context — the project's default
/// isolation is `nonisolated` (ARCHITECTURE.md), unlike `VendpireAPI`.
@MainActor
protocol OutboxSubmitting {
    func submit(_ request: OutboxRequest) async -> SubmitOutcome
}

/// One attempt's worth of request. `payload` is our own `Codable` shape, not
/// the generated wire type — the mapping happens at the network edge, where a
/// spec change is a compile error.
nonisolated struct OutboxRequest: Equatable, Sendable {
    let kind: String
    let clientRequestId: String
    let payload: Data
}
