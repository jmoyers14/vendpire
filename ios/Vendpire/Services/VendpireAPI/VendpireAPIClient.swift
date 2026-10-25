import Foundation
import OpenAPIRuntime
import OpenAPIURLSession

/// The real network implementation of `VendpireAPI`.
///
/// Every method shape is the same: call the generated operation, take the one
/// documented success case, map to `Remote*`. Any other status — 401, 403, 426,
/// 500 — throws, and `MirrorRefresher` turns that into a failed refresh that
/// writes nothing.
struct VendpireAPIClient: VendpireAPI {
    /// Not private: the outbox conformance lives in its own file.
    let client: Client

    /// `transport` and `middlewares` are injectable so the submit path can be
    /// tested against canned HTTP — the generated client's own encoding and
    /// decoding still run, which is where the mapping bugs would be.
    init(
        baseURL: URL = AppEnvironment.apiBaseURL,
        transport: any ClientTransport = URLSessionTransport(),
        middlewares: [any ClientMiddleware] = [AuthTokenMiddleware()]
    ) {
        client = Client(
            serverURL: baseURL,
            configuration: Configuration(dateTranscoder: TolerantDateTranscoder()),
            transport: transport,
            middlewares: middlewares
        )
    }

    func fetchIdentity() async throws -> RemoteIdentity {
        let response = try await client.getCurrentIdentity(.init())
        let identity = try response.ok.body.json
        return RemoteIdentity(identity)
    }

    func fetchLocations() async throws -> [RemoteLocation] {
        let response = try await client.listLocations(.init())
        let locations = try response.ok.body.json
        return locations.map(RemoteLocation.init)
    }

    func fetchMachines() async throws -> [RemoteMachine] {
        let response = try await client.listMachines(.init())
        let machines = try response.ok.body.json
        return machines.map(RemoteMachine.init)
    }

    func fetchProducts() async throws -> [RemoteProduct] {
        let response = try await client.listProducts(.init())
        let products = try response.ok.body.json
        return products.map(RemoteProduct.init)
    }

    func fetchPacks() async throws -> [RemotePack] {
        let response = try await client.listPacks(.init())
        let packs = try response.ok.body.json
        return packs.map(RemotePack.init)
    }

    func fetchCurrentPlanograms() async throws -> [RemotePlanogram] {
        let response = try await client.listCurrentPlanograms(.init())
        let planograms = try response.ok.body.json
        return planograms.map(RemotePlanogram.init)
    }

    func fetchLatestVisits() async throws -> [RemoteVisit] {
        let response = try await client.listLatestVisits(.init())
        let visits = try response.ok.body.json
        return visits.map(RemoteVisit.init)
    }
}
