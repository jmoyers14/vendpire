import Foundation

/// The single seam between the app and the network.
///
/// Vends `Remote*` rather than the generated OpenAPI types so a stub stays two
/// lines and the bundled fixture remains usable as test input. The generated
/// types live behind `VendpireAPIClient` and nowhere else. See ARCHITECTURE.md.
protocol VendpireAPI: Sendable {
    func fetchIdentity() async throws -> RemoteIdentity
    func fetchLocations() async throws -> [RemoteLocation]
    func fetchMachines() async throws -> [RemoteMachine]
    func fetchProducts() async throws -> [RemoteProduct]
    func fetchPacks() async throws -> [RemotePack]
    func fetchCurrentPlanograms() async throws -> [RemotePlanogram]
    func fetchLatestVisits() async throws -> [RemoteVisit]
}
