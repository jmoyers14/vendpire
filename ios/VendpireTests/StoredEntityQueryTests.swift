import SwiftData
import XCTest

@testable import Vendpire

/// The predicates the navigation screens query with. A predicate that silently
/// matches nothing renders an empty screen that looks like missing data.
@MainActor
final class StoredEntityQueryTests: XCTestCase {
    private var container: ModelContainer!
    private var context: ModelContext!

    private func setUpStore() throws {
        container = try VendpireStore.makeInMemoryContainer()
        context = ModelContext(container)
    }

    func testMachinesAtLocationExcludesOtherLocations() throws {
        try setUpStore()
        context.insert(makeMachine(id: "m-1", locationId: "loc-a", name: "Snack"))
        context.insert(makeMachine(id: "m-2", locationId: "loc-a", name: "Drink"))
        context.insert(makeMachine(id: "m-3", locationId: "loc-b", name: "Elsewhere"))

        let found = try fetch(StoredMachine.self, matching: StoredMachine.atLocation("loc-a"))

        XCTAssertEqual(Set(found.map(\.id)), ["m-1", "m-2"])
    }

    func testMachinesAtLocationExcludesSoftDeleted() throws {
        try setUpStore()
        context.insert(makeMachine(id: "m-1", locationId: "loc-a", name: "Live"))
        context.insert(
            makeMachine(id: "m-2", locationId: "loc-a", name: "Gone", deletedAt: .distantPast)
        )

        let found = try fetch(StoredMachine.self, matching: StoredMachine.atLocation("loc-a"))

        XCTAssertEqual(found.map(\.id), ["m-1"])
    }

    func testAnUnknownLocationMatchesNothing() throws {
        try setUpStore()
        context.insert(makeMachine(id: "m-1", locationId: "loc-a", name: "Snack"))

        let found = try fetch(StoredMachine.self, matching: StoredMachine.atLocation("loc-zzz"))

        XCTAssertTrue(found.isEmpty)
    }

    func testVisibleLocationsExcludeSoftDeleted() throws {
        try setUpStore()
        context.insert(StoredLocation(id: "loc-a", name: "Right-On Studios"))
        context.insert(StoredLocation(id: "loc-b", name: "Closed", deletedAt: .distantPast))

        let found = try fetch(StoredLocation.self, matching: StoredLocation.visible)

        XCTAssertEqual(found.map(\.id), ["loc-a"])
    }

    func testThePlanogramForAMachineExcludesOtherMachines() throws {
        try setUpStore()
        context.insert(makePlanogram(id: "pg-1", machineId: "m-1"))
        context.insert(makePlanogram(id: "pg-2", machineId: "m-2"))

        let found = try fetch(StoredPlanogram.self, matching: StoredPlanogram.forMachine("m-1"))

        XCTAssertEqual(found.map(\.id), ["pg-1"])
    }

    func testASoftDeletedPlanogramIsNotTheMachinesPlanogram() throws {
        try setUpStore()
        context.insert(makePlanogram(id: "pg-1", machineId: "m-1", deletedAt: .distantPast))

        let found = try fetch(StoredPlanogram.self, matching: StoredPlanogram.forMachine("m-1"))

        XCTAssertTrue(found.isEmpty)
    }

    /// Reachable today: a machine added on the web and not yet planogrammed.
    /// The face must render every cell empty rather than fail to build.
    func testAMachineWithNoPlanogramMatchesNothing() throws {
        try setUpStore()
        context.insert(makePlanogram(id: "pg-1", machineId: "m-1"))

        let found = try fetch(StoredPlanogram.self, matching: StoredPlanogram.forMachine("m-zzz"))

        XCTAssertTrue(found.isEmpty)
    }

    /// The mirror holds one planogram per machine — the server already picked.
    /// If a re-sync ever leaves two, latest wins, matching findCurrentByMachine.
    func testTheNewestPlanogramSortsFirst() throws {
        try setUpStore()
        context.insert(
            makePlanogram(id: "pg-old", machineId: "m-1", effectiveFrom: .distantPast)
        )
        context.insert(
            makePlanogram(id: "pg-new", machineId: "m-1", effectiveFrom: .distantFuture)
        )

        let found = try fetch(
            StoredPlanogram.self,
            matching: StoredPlanogram.forMachine("m-1"),
            sortedBy: StoredPlanogram.newestFirst
        )

        XCTAssertEqual(found.map(\.id), ["pg-new", "pg-old"])
    }

    // MARK: - Helpers

    private func fetch<Model: PersistentModel>(
        _ type: Model.Type,
        matching predicate: Predicate<Model>,
        sortedBy sortDescriptors: [SortDescriptor<Model>] = []
    ) throws -> [Model] {
        try context.fetch(FetchDescriptor<Model>(predicate: predicate, sortBy: sortDescriptors))
    }

    private func makePlanogram(
        id: String,
        machineId: String,
        effectiveFrom: Date = .distantPast,
        deletedAt: Date? = nil
    ) -> StoredPlanogram {
        StoredPlanogram(
            id: id,
            machineId: machineId,
            effectiveFrom: effectiveFrom,
            slots: [PlanogramSlot(slotCode: "A0", productId: "p-0", par: 10, priceCents: 175)],
            deletedAt: deletedAt
        )
    }

    private func makeMachine(
        id: String,
        locationId: String,
        name: String,
        deletedAt: Date? = nil
    ) -> StoredMachine {
        StoredMachine(
            id: id,
            locationId: locationId,
            name: name,
            kind: "snack",
            slots: [["A0", "A2"]],
            deletedAt: deletedAt
        )
    }
}
