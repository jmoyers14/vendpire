import Foundation

/// The single seam between the app and the network.
///
/// Declared now, implemented in Phase 7. Services take this protocol so their
/// orchestration — full refresh, outbox submission, retry — can be tested
/// against a stub with an in-memory store, which is where the bugs that lose
/// field data actually live. See ARCHITECTURE.md.
///
/// Deliberately empty until there are endpoints to call: an invented method
/// signature here would be a guess at a contract that Phase 6 has not written.
protocol VendpireAPI: Sendable {}
