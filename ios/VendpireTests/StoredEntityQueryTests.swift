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

    // MARK: - Helpers

    private func fetch<Model: PersistentModel>(
        _ type: Model.Type,
        matching predicate: Predicate<Model>
    ) throws -> [Model] {
        try context.fetch(FetchDescriptor<Model>(predicate: predicate))
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
