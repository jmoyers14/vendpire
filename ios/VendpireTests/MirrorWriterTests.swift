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
        try writer.apply(makeRemoteOrg())

        XCTAssertEqual(try count(StoredLocation.self), 1)
        XCTAssertEqual(try count(StoredMachine.self), 1)
        XCTAssertEqual(try count(StoredProduct.self), 1)
        XCTAssertEqual(try count(StoredPack.self), 1)
        XCTAssertEqual(try count(StoredPlanogram.self), 1)
    }

    func testReapplyingTheSameRemoteOrgDoesNotDuplicate() throws {
        try setUpStore()
        let remote = makeRemoteOrg()
        try writer.apply(remote)
        try writer.apply(remote)

        XCTAssertEqual(try count(StoredMachine.self), 1)
        XCTAssertEqual(try count(StoredProduct.self), 1)
    }

    func testUpsertUpdatesInPlaceRatherThanReplacing() throws {
        try setUpStore()
        try writer.apply(makeRemoteOrg())
        let before = try XCTUnwrap(try fetch(StoredProduct.self).first)
        let identity = before.persistentModelID

        try writer.apply(makeRemoteOrg(productName: "Renamed"))

        let after = try XCTUnwrap(try fetch(StoredProduct.self).first)
        XCTAssertEqual(after.name, "Renamed")
        XCTAssertEqual(after.persistentModelID, identity, "should update the row, not swap it")
    }

    // MARK: - Remove-missing

    /// Without this the mirror happily renders a machine deleted months ago.
    func testRemovesRecordsTheRemoteOrgNoLongerCarries() throws {
        try setUpStore()
        try writer.apply(makeRemoteOrg(machineIds: ["machine-1", "machine-2"]))
        XCTAssertEqual(try count(StoredMachine.self), 2)

        try writer.apply(makeRemoteOrg(machineIds: ["machine-1"]))

        let remaining = try fetch(StoredMachine.self)
        XCTAssertEqual(remaining.map(\.id), ["machine-1"])
    }

    func testAnEmptyRemoteOrgEmptiesTheStore() throws {
        try setUpStore()
        try writer.apply(makeRemoteOrg())
        try writer.apply(makeRemoteOrg(machineIds: [], includeOtherEntities: false))

        XCTAssertEqual(try count(StoredMachine.self), 0)
        XCTAssertEqual(try count(StoredProduct.self), 0)
    }

    // MARK: - The org boundary

    func testSwitchingOrgWipesTheStoreFirst() throws {
        try setUpStore()
        try writer.apply(makeRemoteOrg(orgId: "org-a", machineIds: ["a-machine"]))
        try writer.apply(makeRemoteOrg(orgId: "org-b", machineIds: ["b-machine"]))

        let machines = try fetch(StoredMachine.self)
        XCTAssertEqual(machines.map(\.id), ["b-machine"], "org-a rows must not survive")

        let metadata = try fetch(StoreMetadata.self)
        XCTAssertEqual(metadata.count, 1)
        XCTAssertEqual(metadata.first?.orgId, "org-b")
    }

    func testStampsMetadataOnFirstApply() throws {
        try setUpStore()
        let exportedAt = Date(timeIntervalSince1970: 1_000_000)
        try writer.apply(makeRemoteOrg(orgId: "org-a", exportedAt: exportedAt))

        let metadata = try fetch(StoreMetadata.self)
        XCTAssertEqual(metadata.count, 1)
        XCTAssertEqual(metadata.first?.orgId, "org-a")
        XCTAssertEqual(metadata.first?.lastSyncedAt, exportedAt)
    }

    // MARK: - Layout fidelity

    /// Real machines have shelves of differing widths; inferring layout from
    /// slot codes would quietly reshape the face grid.
    func testRaggedShelvesSurviveRoundTripExactly() throws {
        try setUpStore()
        let ragged = [["A0", "A2", "A4", "A6"], ["B0", "B2"], ["C0", "C2", "C4", "C6", "C8"]]
        try writer.apply(makeRemoteOrg(slots: ragged))

        let machine = try XCTUnwrap(try fetch(StoredMachine.self).first)
        XCTAssertEqual(machine.slots, ragged)
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
        exportedAt: Date = Date(timeIntervalSince1970: 0),
        machineIds: [String] = ["machine-1"],
        productName: String = "Cinnamon Roll",
        slots: [[String]] = [["A0", "A2"]],
        includeOtherEntities: Bool = true
    ) -> RemoteOrg {
        RemoteOrg(
            orgId: orgId,
            exportedAt: exportedAt,
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
}
