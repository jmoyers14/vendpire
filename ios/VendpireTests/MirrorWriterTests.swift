import SwiftData
import XCTest

@testable import Vendpire

/// Real SwiftData against an in-memory container — no simulator UI, no network.
/// The cases that matter are the ones that lose data: a record the server
/// dropped surviving a refresh, and an org change leaving rows behind.
@MainActor
final class MirrorWriterTests: XCTestCase {
    private var container: ModelContainer!
    private var context: ModelContext!
    private var writer: MirrorWriter!

    /// Called per test rather than from `setUpWithError`: XCTest declares that
    /// nonisolated, so passing a `ModelContext` to the main-actor writer from
    /// there is a data race.
    private func setUpStore() throws {
        container = try VendpireStore.makeInMemoryContainer()
        context = ModelContext(container)
        writer = MirrorWriter(context: context)
    }

    // MARK: - Upsert

    func testAppliesEveryEntityInTheRemoteOrg() throws {
        try setUpStore()
        try writer.apply(makeRemoteOrg(), syncedAt: Date(timeIntervalSince1970: 0))

        XCTAssertEqual(try count(StoredLocation.self), 1)
        XCTAssertEqual(try count(StoredMachine.self), 1)
        XCTAssertEqual(try count(StoredProduct.self), 1)
        XCTAssertEqual(try count(StoredPack.self), 1)
        XCTAssertEqual(try count(StoredPlanogram.self), 1)
    }

    func testReapplyingTheSameRemoteOrgDoesNotDuplicate() throws {
        try setUpStore()
        let remote = makeRemoteOrg()
        try writer.apply(remote, syncedAt: Date(timeIntervalSince1970: 0))
        try writer.apply(remote, syncedAt: Date(timeIntervalSince1970: 0))

        XCTAssertEqual(try count(StoredMachine.self), 1)
        XCTAssertEqual(try count(StoredProduct.self), 1)
    }

    func testUpsertUpdatesInPlaceRatherThanReplacing() throws {
        try setUpStore()
        try writer.apply(makeRemoteOrg(), syncedAt: Date(timeIntervalSince1970: 0))
        let before = try XCTUnwrap(try fetch(StoredProduct.self).first)
        let identity = before.persistentModelID

        try writer.apply(makeRemoteOrg(productName: "Renamed"), syncedAt: Date(timeIntervalSince1970: 0))

        let after = try XCTUnwrap(try fetch(StoredProduct.self).first)
        XCTAssertEqual(after.name, "Renamed")
        XCTAssertEqual(after.persistentModelID, identity, "should update the row, not swap it")
    }

    // MARK: - Remove-missing

    /// Without this the mirror happily renders a machine deleted months ago.
    func testRemovesRecordsTheRemoteOrgNoLongerCarries() throws {
        try setUpStore()
        try writer.apply(makeRemoteOrg(machineIds: ["machine-1", "machine-2"]), syncedAt: Date(timeIntervalSince1970: 0))
        XCTAssertEqual(try count(StoredMachine.self), 2)

        try writer.apply(makeRemoteOrg(machineIds: ["machine-1"]), syncedAt: Date(timeIntervalSince1970: 0))

        let remaining = try fetch(StoredMachine.self)
        XCTAssertEqual(remaining.map(\.id), ["machine-1"])
    }

    func testAnEmptyRemoteOrgEmptiesTheStore() throws {
        try setUpStore()
        try writer.apply(makeRemoteOrg(), syncedAt: Date(timeIntervalSince1970: 0))
        try writer.apply(makeRemoteOrg(machineIds: [], includeOtherEntities: false), syncedAt: Date(timeIntervalSince1970: 0))

        XCTAssertEqual(try count(StoredMachine.self), 0)
        XCTAssertEqual(try count(StoredProduct.self), 0)
    }

    // MARK: - The org boundary

    func testSwitchingOrgWipesTheStoreFirst() throws {
        try setUpStore()
        try writer.apply(makeRemoteOrg(orgId: "org-a", machineIds: ["a-machine"]), syncedAt: Date(timeIntervalSince1970: 0))
        try writer.apply(makeRemoteOrg(orgId: "org-b", machineIds: ["b-machine"]), syncedAt: Date(timeIntervalSince1970: 0))

        let machines = try fetch(StoredMachine.self)
        XCTAssertEqual(machines.map(\.id), ["b-machine"], "org-a rows must not survive")

        let metadata = try fetch(StoreMetadata.self)
        XCTAssertEqual(metadata.count, 1)
        XCTAssertEqual(metadata.first?.orgId, "org-b")
    }

    // MARK: - The transaction boundary

    func testStampsTheSyncedAtItWasGivenRatherThanAnythingInThePayload() throws {
        try setUpStore()
        let syncedAt = Date(timeIntervalSince1970: 1_000_000)

        try writer.apply(makeRemoteOrg(orgId: "org-a"), syncedAt: syncedAt)

        let metadata = try fetch(StoreMetadata.self)
        XCTAssertEqual(metadata.first?.lastSyncedAt, syncedAt)
    }

    // MARK: - Layout fidelity

    /// Real machines have shelves of differing widths; inferring layout from
    /// slot codes would quietly reshape the face grid.
    func testRaggedShelvesSurviveRoundTripExactly() throws {
        try setUpStore()
        let ragged = [["A0", "A2", "A4", "A6"], ["B0", "B2"], ["C0", "C2", "C4", "C6", "C8"]]
        try writer.apply(makeRemoteOrg(slots: ragged), syncedAt: Date(timeIntervalSince1970: 0))

        let machine = try XCTUnwrap(try fetch(StoredMachine.self).first)
        XCTAssertEqual(machine.slots, ragged)
    }

    // MARK: - Latest visits

    func testAppliesLatestVisitsKeyedByMachine() throws {
        try setUpStore()

        try writer.applyLatestVisits([makeRemoteVisit(id: "visit-1", machineId: "machine-1")])

        let stored = try fetch(StoredLatestVisit.self)
        XCTAssertEqual(stored.count, 1)
        XCTAssertEqual(stored.first?.machineId, "machine-1")
        XCTAssertEqual(stored.first?.lines.first?.levelAfter, 9)
    }

    func testANewerVisitReplacesTheMachinesPreviousOne() throws {
        try setUpStore()
        try writer.applyLatestVisits([makeRemoteVisit(id: "visit-1", machineId: "machine-1")])

        try writer.applyLatestVisits([makeRemoteVisit(id: "visit-2", machineId: "machine-1")])

        let stored = try fetch(StoredLatestVisit.self)
        XCTAssertEqual(stored.count, 1)
        XCTAssertEqual(stored.first?.id, "visit-2")
    }

    func testDropsAVisitTheServerNoLongerCarries() throws {
        try setUpStore()
        try writer.applyLatestVisits([
            makeRemoteVisit(id: "visit-1", machineId: "machine-1"),
            makeRemoteVisit(id: "visit-2", machineId: "machine-2"),
        ])

        try writer.applyLatestVisits([makeRemoteVisit(id: "visit-1", machineId: "machine-1")])

        XCTAssertEqual(try count(StoredLatestVisit.self), 1)
    }

    /// StoredLatestVisit carries no orgId, so the wipe is the only thing between
    /// it and a cross-org leak.
    func testAnOrgChangeWipesLatestVisitsToo() throws {
        try setUpStore()
        try writer.apply(makeRemoteOrg(orgId: "org-a"), syncedAt: Date())
        try writer.applyLatestVisits([makeRemoteVisit(id: "visit-1", machineId: "machine-1")])

        try writer.apply(makeRemoteOrg(orgId: "org-b"), syncedAt: Date())

        XCTAssertEqual(try count(StoredLatestVisit.self), 0)
    }

    // MARK: - Helpers

    private func fetch<Model: PersistentModel>(_ type: Model.Type) throws -> [Model] {
        try context.fetch(FetchDescriptor<Model>())
    }

    private func count<Model: PersistentModel>(_ type: Model.Type) throws -> Int {
        try fetch(type).count
    }

    private func makeRemoteOrg(
        orgId: String = "org-a",
        machineIds: [String] = ["machine-1"],
        productName: String = "Cinnamon Roll",
        slots: [[String]] = [["A0", "A2"]],
        includeOtherEntities: Bool = true
    ) -> RemoteOrg {
        RemoteOrg(
            orgId: orgId,
            locations: includeOtherEntities ? [makeLocation()] : [],
            machines: machineIds.map { makeMachine(id: $0, slots: slots) },
            products: includeOtherEntities ? [makeProduct(name: productName)] : [],
            packs: includeOtherEntities ? [makePack()] : [],
            planograms: includeOtherEntities ? [makePlanogram()] : []
        )
    }

    private func makeLocation() -> RemoteLocation {
        RemoteLocation(
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
    }

    private func makeMachine(id: String, slots: [[String]]) -> RemoteMachine {
        RemoteMachine(
            id: id,
            locationId: "location-1",
            name: "National 148",
            kind: "snack",
            make: nil,
            model: nil,
            serial: nil,
            tagCode: nil,
            slots: slots,
            cardReader: nil,
            active: true,
            deletedAt: nil,
            updatedAt: nil
        )
    }

    private func makeProduct(name: String) -> RemoteProduct {
        RemoteProduct(
            id: "product-1",
            name: name,
            upc: nil,
            category: "snacks",
            taxClass: nil,
            imageUrl: nil,
            defaultPriceCents: 500,
            active: true,
            deletedAt: nil,
            updatedAt: nil
        )
    }

    private func makePack() -> RemotePack {
        RemotePack(
            id: "pack-1",
            name: "Cinnamon Roll case (12)",
            barcodes: ["00085264790027"],
            contents: [PackContent(productId: "product-1", units: 12)],
            active: true,
            deletedAt: nil,
            updatedAt: nil
        )
    }

    private func makePlanogram() -> RemotePlanogram {
        RemotePlanogram(
            id: "planogram-1",
            machineId: "machine-1",
            effectiveFrom: Date(timeIntervalSince1970: 0),
            slots: [PlanogramSlot(slotCode: "A0", productId: "product-1", par: 10, priceCents: 500)],
            deletedAt: nil,
            updatedAt: nil
        )
    }

    private func makeRemoteVisit(id: String, machineId: String) -> RemoteVisit {
        RemoteVisit(
            id: id,
            machineId: machineId,
            countedAt: Date(timeIntervalSince1970: 0),
            lines: [
                RemoteVisitLine(
                    slotCode: "A0",
                    productId: "product-1",
                    remaining: 2,
                    added: 8,
                    removed: 1
                )
            ]
        )
    }
}
