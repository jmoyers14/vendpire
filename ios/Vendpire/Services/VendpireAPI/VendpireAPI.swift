import Foundation

/// The single seam between the app and the network.
///
/// Services take this protocol so their orchestration — full refresh, outbox
/// submission, retry — can be tested against a stub with an in-memory store,
/// which is where the bugs that lose field data live. See ARCHITECTURE.md.
///
/// Empty until there are endpoints to call: a method signature here would be a
/// guess at a contract the REST surface has not defined.
protocol VendpireAPI: Sendable {}
