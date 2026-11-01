import Foundation
import OpenAPIRuntime
import OpenAPIURLSession

/// The real network implementation of `VendpireAPI`.
///
/// Two method shapes. The read paths take the one documented success case and
/// map to `Remote*`; any other status throws, and `MirrorRefresher` turns that
/// into a failed refresh that writes nothing.
///
/// The catalog write paths — the candidate lookup, the two creates, the two
/// attaches — switch the generated `Output` exhaustively instead, because a
/// human reads their failures. `response.ok` would collapse a 409 into
/// `RuntimeError.unexpectedResponseStatus`, and the sentence naming the record
/// a barcode is already on is exactly what the operator needs. See
/// `VendpireAPIError`.
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

    /// The outside guess. Documented failures here are all infrastructure —
    /// the caller treats any of them as "no guess" — but they are switched
    /// exhaustively like the rest so a spec change breaks the build.
    func fetchBarcodeCandidate(code: String) async throws -> RemoteCandidate? {
        let response = try await client.getBarcodeCandidate(query: .init(code: code))
        switch response {
        case .ok(let success):
            let payload = try success.body.json
            return payload.map(RemoteCandidate.init)
        case .unauthorized(let rejection):
            throw VendpireAPIError(statusCode: 401, message: try? rejection.body.json.message)
        case .forbidden(let rejection):
            throw VendpireAPIError(statusCode: 403, message: try? rejection.body.json.message)
        case .upgradeRequired(let rejection):
            throw VendpireAPIError(statusCode: 426, message: try? rejection.body.json.message)
        case .internalServerError(let rejection):
            throw VendpireAPIError(statusCode: 500, message: try? rejection.body.json.message)
        case .undocumented(let statusCode, _):
            throw VendpireAPIError(statusCode: statusCode, message: nil)
        }
    }

    func createProduct(_ draft: RemoteProductDraft) async throws -> RemoteProduct {
        let response = try await client.createProduct(body: .json(.init(draft)))
        switch response {
        case .ok(let success):
            let product = try success.body.json
            return RemoteProduct(product)
        case .badRequest(let rejection):
            throw VendpireAPIError(statusCode: 400, message: try? rejection.body.json.message)
        case .unauthorized(let rejection):
            throw VendpireAPIError(statusCode: 401, message: try? rejection.body.json.message)
        case .forbidden(let rejection):
            throw VendpireAPIError(statusCode: 403, message: try? rejection.body.json.message)
        case .conflict(let rejection):
            throw VendpireAPIError(statusCode: 409, message: try? rejection.body.json.message)
        case .upgradeRequired(let rejection):
            throw VendpireAPIError(statusCode: 426, message: try? rejection.body.json.message)
        case .internalServerError(let rejection):
            throw VendpireAPIError(statusCode: 500, message: try? rejection.body.json.message)
        case .undocumented(let statusCode, _):
            throw VendpireAPIError(statusCode: statusCode, message: nil)
        }
    }

    func createPack(_ draft: RemotePackDraft) async throws -> RemotePack {
        let response = try await client.createPack(body: .json(.init(draft)))
        switch response {
        case .ok(let success):
            let pack = try success.body.json
            return RemotePack(pack)
        case .badRequest(let rejection):
            throw VendpireAPIError(statusCode: 400, message: try? rejection.body.json.message)
        case .unauthorized(let rejection):
            throw VendpireAPIError(statusCode: 401, message: try? rejection.body.json.message)
        case .forbidden(let rejection):
            throw VendpireAPIError(statusCode: 403, message: try? rejection.body.json.message)
        case .conflict(let rejection):
            throw VendpireAPIError(statusCode: 409, message: try? rejection.body.json.message)
        case .upgradeRequired(let rejection):
            throw VendpireAPIError(statusCode: 426, message: try? rejection.body.json.message)
        case .internalServerError(let rejection):
            throw VendpireAPIError(statusCode: 500, message: try? rejection.body.json.message)
        case .undocumented(let statusCode, _):
            throw VendpireAPIError(statusCode: statusCode, message: nil)
        }
    }

    func attachProductBarcode(productId: String, code: String) async throws -> RemoteProduct {
        let response = try await client.attachProductBarcode(
            path: .init(id: productId), body: .json(.init(code: code))
        )
        switch response {
        case .ok(let success):
            let product = try success.body.json
            return RemoteProduct(product)
        case .badRequest(let rejection):
            throw VendpireAPIError(statusCode: 400, message: try? rejection.body.json.message)
        case .unauthorized(let rejection):
            throw VendpireAPIError(statusCode: 401, message: try? rejection.body.json.message)
        case .forbidden(let rejection):
            throw VendpireAPIError(statusCode: 403, message: try? rejection.body.json.message)
        case .notFound(let rejection):
            throw VendpireAPIError(statusCode: 404, message: try? rejection.body.json.message)
        case .conflict(let rejection):
            throw VendpireAPIError(statusCode: 409, message: try? rejection.body.json.message)
        case .upgradeRequired(let rejection):
            throw VendpireAPIError(statusCode: 426, message: try? rejection.body.json.message)
        case .internalServerError(let rejection):
            throw VendpireAPIError(statusCode: 500, message: try? rejection.body.json.message)
        case .undocumented(let statusCode, _):
            throw VendpireAPIError(statusCode: statusCode, message: nil)
        }
    }

    func attachPackBarcode(packId: String, code: String) async throws -> RemotePack {
        let response = try await client.attachPackBarcode(
            path: .init(id: packId), body: .json(.init(code: code))
        )
        switch response {
        case .ok(let success):
            let pack = try success.body.json
            return RemotePack(pack)
        case .badRequest(let rejection):
            throw VendpireAPIError(statusCode: 400, message: try? rejection.body.json.message)
        case .unauthorized(let rejection):
            throw VendpireAPIError(statusCode: 401, message: try? rejection.body.json.message)
        case .forbidden(let rejection):
            throw VendpireAPIError(statusCode: 403, message: try? rejection.body.json.message)
        case .notFound(let rejection):
            throw VendpireAPIError(statusCode: 404, message: try? rejection.body.json.message)
        case .conflict(let rejection):
            throw VendpireAPIError(statusCode: 409, message: try? rejection.body.json.message)
        case .upgradeRequired(let rejection):
            throw VendpireAPIError(statusCode: 426, message: try? rejection.body.json.message)
        case .internalServerError(let rejection):
            throw VendpireAPIError(statusCode: 500, message: try? rejection.body.json.message)
        case .undocumented(let statusCode, _):
            throw VendpireAPIError(statusCode: statusCode, message: nil)
        }
    }
}
