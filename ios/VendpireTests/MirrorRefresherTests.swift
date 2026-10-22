import SwiftData
import XCTest

@testable import Vendpire

/// Real SwiftData, stubbed network. These are the cases that lose field data:
/// a refresh deleting the catalog because one call failed, and an org change
/// leaving rows behind.
@MainActor
final class MirrorRefresherTests: XCTestCase {
    private var container: ModelContainer!
    private var context: ModelContext!
    private var writer: MirrorWriter!
    private var api: StubVendpireAPI!

    private func setUpStore() throws {
        container = try VendpireStore.makeInMemoryContainer()
        context = ModelContext(container)
        writer = MirrorWriter(context: context)
        api = StubVendpireAPI()
        api.locations = { [Self.location] }
        api.products = { [Self.product] }
    }

    private func makeRefresher() -> MirrorRefresher {
        MirrorRefresher(api: api, writer: writer)
    }

    func testASuccessfulRefreshFillsTheStoreAndStamps() async throws {
        try setUpStore()
        let refresher = makeRefresher()

        await refresher.refresh()

        XCTAssertEqual(try count(StoredLocation.self), 1)
        XCTAssertEqual(try count(StoredProduct.self), 1)
        guard case .synced = refresher.state else {
            return XCTFail("expected .synced, got \(refresher.state)")
        }
        XCTAssertEqual(try fetch(StoreMetadata.self).first?.orgId, "org-a")
    }

    /// The one this whole design exists for: remove-missing means a payload
    /// without products deletes every product.
    func testAFailedProductsFetchLeavesTheStoreCompletelyUnchanged() async throws {
        try setUpStore()
        await makeRefresher().refresh()
        let productsBefore = try count(StoredProduct.self)
        let locationsBefore = try count(StoredLocation.self)

        api.products = { throw StubError.unreachable }
        let refresher = makeRefresher()
        await refresher.refresh()

        XCTAssertEqual(try count(StoredProduct.self), productsBefore)
        XCTAssertEqual(try count(StoredLocation.self), locationsBefore)
        guard case .failed = refresher.state else {
            return XCTFail("expected .failed, got \(refresher.state)")
        }
    }

    /// Latest visits are a leaf — failing there leaves the refresh successful.
    func testAFailedLatestVisitsFetchStillCountsAsASyncedRefresh() async throws {
        try setUpStore()
        api.latestVisits = { throw StubError.unreachable }
        let refresher = makeRefresher()

        await refresher.refresh()

        XCTAssertEqual(try count(StoredLocation.self), 1)
        guard case .synced = refresher.state else {
            return XCTFail("expected .synced, got \(refresher.state)")
        }
    }

    func testADifferentOrgWipesTheStoreBeforeRefilling() async throws {
        try setUpStore()
        await makeRefresher().refresh()
        try writer.applyLatestVisits([Self.visit])
        XCTAssertEqual(try count(StoredLatestVisit.self), 1)

        api.identity = { RemoteIdentity(userId: "user-1", orgId: "org-b") }
        await makeRefresher().refresh()

        XCTAssertEqual(try fetch(StoreMetadata.self).first?.orgId, "org-b")
        XCTAssertEqual(try count(StoredLatestVisit.self), 0)
    }

    func testAMemberLessUserMakesNoFurtherCallsAndWritesNothing() async throws {
        try setUpStore()
        api.identity = { RemoteIdentity(userId: "user-1", orgId: nil) }
        let refresher = makeRefresher()

        await refresher.refresh()

        XCTAssertEqual(api.callCount, 1)
        XCTAssertEqual(try count(StoredLocation.self), 0)
        XCTAssertEqual(try fetch(StoreMetadata.self).count, 0)
        guard case .failed(let message) = refresher.state else {
            return XCTFail("expected .failed, got \(refresher.state)")
        }
        XCTAssertTrue(message.contains("organization"))
    }

    func testRefreshingTwiceConverges() async throws {
        try setUpStore()

        await makeRefresher().refresh()
        await makeRefresher().refresh()

        XCTAssertEqual(try count(StoredLocation.self), 1)
        XCTAssertEqual(try count(StoredProduct.self), 1)
    }

    // MARK: - Helpers

    private func fetch<Model: PersistentModel>(_ type: Model.Type) throws -> [Model] {
        try context.fetch(FetchDescriptor<Model>())
    }

    private func count<Model: PersistentModel>(_ type: Model.Type) throws -> Int {
        try fetch(type).count
    }

    // nonisolated: these feed @Sendable stub closures that are not guaranteed
    // to run on the main actor, so a MainActor-isolated static let won't compile.
    private nonisolated static let location = RemoteLocation(
        id: "location-1",
        name: "Right-On Studios",
        address: nil,
        contact: nil,
        commission: nil,
        notes: nil,
        active: true,
        deletedAt: nil,
        updatedAt: nil
    )

    private nonisolated static let product = RemoteProduct(
        id: "product-1",
        name: "Cinnamon Roll",
        upc: nil,
        category: "pastry",
        taxClass: nil,
        imageUrl: nil,
        defaultPriceCents: 175,
        active: true,
        deletedAt: nil,
        updatedAt: nil
    )

    private static let visit = RemoteVisit(
        id: "visit-1",
        machineId: "machine-1",
        countedAt: Date(timeIntervalSince1970: 0),
        lines: []
    )
}
