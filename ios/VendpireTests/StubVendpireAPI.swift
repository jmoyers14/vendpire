import Foundation

@testable import Vendpire

/// Configurable stand-in for the network. Each closure defaults to returning
/// empty, and a test overrides only what it cares about — including throwing,
/// which is how the "a failed fetch must not delete anything" cases are built.
final class StubVendpireAPI: VendpireAPI, @unchecked Sendable {
    var identity: @Sendable () async throws -> RemoteIdentity = {
        RemoteIdentity(userId: "user-1", orgId: "org-a")
    }
    var locations: @Sendable () async throws -> [RemoteLocation] = { [] }
    var machines: @Sendable () async throws -> [RemoteMachine] = { [] }
    var products: @Sendable () async throws -> [RemoteProduct] = { [] }
    var packs: @Sendable () async throws -> [RemotePack] = { [] }
    var planograms: @Sendable () async throws -> [RemotePlanogram] = { [] }
    var latestVisits: @Sendable () async throws -> [RemoteVisit] = { [] }
    var onFetchBarcodeCandidate: @Sendable (String) async throws -> RemoteCandidate? = { _ in throw StubError.unreachable }
    var onCreateProduct: @Sendable (RemoteProductDraft) async throws -> RemoteProduct = { _ in throw StubError.unreachable }
    var onCreatePack: @Sendable (RemotePackDraft) async throws -> RemotePack = { _ in throw StubError.unreachable }
    var onAttachProductBarcode: @Sendable (String, String) async throws -> RemoteProduct = { _, _ in throw StubError.unreachable }
    var onAttachPackBarcode: @Sendable (String, String) async throws -> RemotePack = { _, _ in throw StubError.unreachable }

    private(set) var callCount = 0

    func fetchIdentity() async throws -> RemoteIdentity {
        callCount += 1
        return try await identity()
    }

    func fetchLocations() async throws -> [RemoteLocation] {
        callCount += 1
        return try await locations()
    }

    func fetchMachines() async throws -> [RemoteMachine] {
        callCount += 1
        return try await machines()
    }

    func fetchProducts() async throws -> [RemoteProduct] {
        callCount += 1
        return try await products()
    }

    func fetchPacks() async throws -> [RemotePack] {
        callCount += 1
        return try await packs()
    }

    func fetchCurrentPlanograms() async throws -> [RemotePlanogram] {
        callCount += 1
        return try await planograms()
    }

    func fetchLatestVisits() async throws -> [RemoteVisit] {
        callCount += 1
        return try await latestVisits()
    }

    func fetchBarcodeCandidate(code: String) async throws -> RemoteCandidate? {
        callCount += 1
        return try await onFetchBarcodeCandidate(code)
    }

    func createProduct(_ draft: RemoteProductDraft) async throws -> RemoteProduct {
        callCount += 1
        return try await onCreateProduct(draft)
    }

    func createPack(_ draft: RemotePackDraft) async throws -> RemotePack {
        callCount += 1
        return try await onCreatePack(draft)
    }

    func attachProductBarcode(productId: String, code: String) async throws -> RemoteProduct {
        callCount += 1
        return try await onAttachProductBarcode(productId, code)
    }

    func attachPackBarcode(packId: String, code: String) async throws -> RemotePack {
        callCount += 1
        return try await onAttachPackBarcode(packId, code)
    }
}

enum StubError: Error { case unreachable }
