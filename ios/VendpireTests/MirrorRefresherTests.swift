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
        api.machines = { [Self.machine] }
        api.products = { [Self.product] }
        api.packs = { [Self.pack] }
        api.planograms = { [Self.planogram] }
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
    /// without products deletes every product. The seeded visit also guards
    /// the outer catch's `return` in MirrorRefresher — drop that return and
    /// this still passed before, because nothing had created a visit to lose.
    func testAFailedProductsFetchLeavesTheStoreCompletelyUnchanged() async throws {
        try setUpStore()
        await makeRefresher().refresh()
        try writer.applyLatestVisits([Self.visit])
        let productsBefore = try count(StoredProduct.self)
        let locationsBefore = try count(StoredLocation.self)
        let visitsBefore = try count(StoredLatestVisit.self)

        api.products = { throw StubError.unreachable }
        let refresher = makeRefresher()
        await refresher.refresh()

        XCTAssertEqual(try count(StoredProduct.self), productsBefore)
        XCTAssertEqual(try count(StoredLocation.self), locationsBefore)
        XCTAssertEqual(try count(StoredLatestVisit.self), visitsBefore)
        guard case .failed = refresher.state else {
            return XCTFail("expected .failed, got \(refresher.state)")
        }
    }

    /// The other four arms of the fan-in can wipe their own entity exactly
    /// the way products can; `setUpStore` seeds one of everything so a wipe
    /// is distinguishable from "there were never any to begin with".
    func testAFailedLocationsFetchLeavesEveryEntityUnchanged() async throws {
        try await assertAFailedFetchLeavesEveryEntityUnchanged { $0.locations = { throw StubError.unreachable } }
    }

    func testAFailedMachinesFetchLeavesEveryEntityUnchanged() async throws {
        try await assertAFailedFetchLeavesEveryEntityUnchanged { $0.machines = { throw StubError.unreachable } }
    }

    func testAFailedPacksFetchLeavesEveryEntityUnchanged() async throws {
        try await assertAFailedFetchLeavesEveryEntityUnchanged { $0.packs = { throw StubError.unreachable } }
    }

    func testAFailedPlanogramsFetchLeavesEveryEntityUnchanged() async throws {
        try await assertAFailedFetchLeavesEveryEntityUnchanged { $0.planograms = { throw StubError.unreachable } }
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

    /// Task 11 calls `refresh()` from both `.task` and a scene-phase
    /// observer, which fire within milliseconds of each other at launch.
    /// The gate holds the first refresh mid-flight so the second can be
    /// shown doing nothing to `state` rather than merely finishing second.
    func testASecondRefreshWhileOneIsInFlightLeavesTheFirstsOutcomeAlone() async throws {
        try setUpStore()
        let gate = RefreshGate()
        api.locations = {
            await gate.wait()
            return [Self.location]
        }
        let refresher = makeRefresher()

        let firstRefresh = Task { await refresher.refresh() }
        while refresher.state != .refreshing {
            await Task.yield()
        }

        await refresher.refresh()
        XCTAssertEqual(refresher.state, .refreshing, "a refresh entered while one is in flight must not touch state")

        await gate.open()
        await firstRefresh.value

        guard case .synced = refresher.state else {
            return XCTFail("expected .synced, got \(refresher.state)")
        }
        XCTAssertEqual(try count(StoredLocation.self), 1)
    }

    // MARK: - Helpers

    private func fetch<Model: PersistentModel>(_ type: Model.Type) throws -> [Model] {
        try context.fetch(FetchDescriptor<Model>())
    }

    private func count<Model: PersistentModel>(_ type: Model.Type) throws -> Int {
        try fetch(type).count
    }

    private func allEntityCounts() throws -> [Int] {
        [
            try count(StoredLocation.self),
            try count(StoredMachine.self),
            try count(StoredProduct.self),
            try count(StoredPack.self),
            try count(StoredPlanogram.self),
        ]
    }

    /// Shared shape for "exactly one reference fetch fails": seed every
    /// entity via a clean refresh, break one fetch, and prove the second
    /// refresh touches none of the five counts rather than just the broken
    /// entity's.
    private func assertAFailedFetchLeavesEveryEntityUnchanged(
        breaking: (StubVendpireAPI) -> Void
    ) async throws {
        try setUpStore()
        await makeRefresher().refresh()
        let before = try allEntityCounts()

        breaking(api)
        let refresher = makeRefresher()
        await refresher.refresh()

        XCTAssertEqual(try allEntityCounts(), before)
        guard case .failed = refresher.state else {
            return XCTFail("expected .failed, got \(refresher.state)")
        }
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

    private nonisolated static let machine = RemoteMachine(
        id: "machine-1",
        locationId: "location-1",
        name: "National 148",
        kind: "snack",
        make: nil,
        model: nil,
        serial: nil,
        tagCode: nil,
        slots: [["A0"]],
        cardReader: nil,
        active: true,
        deletedAt: nil,
        updatedAt: nil
    )

    private nonisolated static let pack = RemotePack(
        id: "pack-1",
        name: "Cinnamon Roll case (12)",
        barcodes: ["00085264790027"],
        contents: [PackContent(productId: "product-1", units: 12)],
        active: true,
        deletedAt: nil,
        updatedAt: nil
    )

    private nonisolated static let planogram = RemotePlanogram(
        id: "planogram-1",
        machineId: "machine-1",
        effectiveFrom: Date(timeIntervalSince1970: 0),
        slots: [PlanogramSlot(slotCode: "A0", productId: "product-1", par: 10, priceCents: 500)],
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

/// Lets a stub closure suspend until the test deliberately releases it, so a
/// second `refresh()` can be issued while the first is provably still
/// in-flight rather than just hoping a timing window lines up.
private actor RefreshGate {
    private var isOpen = false
    private var waiters: [CheckedContinuation<Void, Never>] = []

    func wait() async {
        if isOpen { return }
        await withCheckedContinuation { waiters.append($0) }
    }

    func open() {
        isOpen = true
        for waiter in waiters { waiter.resume() }
        waiters.removeAll()
    }
}
