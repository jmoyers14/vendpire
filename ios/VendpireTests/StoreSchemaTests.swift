import Foundation
import SwiftData
import Testing

@testable import Vendpire

/// These exercise the schema against a real (in-memory) SwiftData stack rather
/// than asserting on the Swift types, because the failures worth catching here
/// are SwiftData's: an attribute type it refuses to persist, a uniqueness
/// constraint that duplicates instead of upserting, or a nested `Codable` value
/// that round-trips lossily.
@MainActor
@Suite("Store schema")
struct StoreSchemaTests {
    private func makeContext() throws -> ModelContext {
        ModelContext(try VendpireStore.makeInMemoryContainer())
    }

    @Test("the schema opens with every model registered")
    func schemaOpens() throws {
        let context = try makeContext()
        #expect(context.container.schema.entities.count == 6)
    }

    /// The plan's load-bearing rule at the storage layer: a machine face is
    /// stored exactly as authored. Ragged shelf widths, zero-padded and
    /// even-numbered codes, and bare letters are all real shapes in the live
    /// data, and none of them survive an implementation that flattens or sorts.
    @Test("machine slots round-trip exactly as authored, including ragged shelves")
    func slotsRoundTripVerbatim() throws {
        let context = try makeContext()
        let authored = [
            ["A0", "A2", "A4", "A6"],
            ["D1", "D2", "D3", "D4", "D5", "D6", "D7"],
            ["F0", "F2", "F4", "F6"],
        ]
        context.insert(
            StoredMachine(id: "m1", locationId: "l1", name: "National 148", kind: "snack", slots: authored)
        )
        try context.save()

        let stored = try #require(try context.fetch(FetchDescriptor<StoredMachine>()).first)

        #expect(stored.slots == authored)
        #expect(stored.slots.map(\.count) == [4, 7, 4])
    }

    @Test("a single-shelf machine with bare letter codes round-trips")
    func bareLetterCodesRoundTrip() throws {
        let context = try makeContext()
        context.insert(
            StoredMachine(
                id: "m2", locationId: "l1", name: "Soda Machine", kind: "drink",
                slots: [["A", "B", "C", "D", "E", "F"]]
            )
        )
        try context.save()

        let stored = try #require(try context.fetch(FetchDescriptor<StoredMachine>()).first)
        #expect(stored.slots == [["A", "B", "C", "D", "E", "F"]])
    }

    /// `id` is the server's id and is unique, so re-importing the same entity
    /// must update it rather than produce a second row. Without this, every
    /// refresh would silently double the store.
    @Test("re-inserting the same id upserts rather than duplicating")
    func uniqueIdUpserts() throws {
        let context = try makeContext()
        context.insert(StoredProduct(id: "p1", name: "Coke", category: "drink", defaultPriceCents: 150))
        try context.save()

        context.insert(StoredProduct(id: "p1", name: "Coca-Cola", category: "drink", defaultPriceCents: 175))
        try context.save()

        let products = try context.fetch(FetchDescriptor<StoredProduct>())
        #expect(products.count == 1)
        #expect(products.first?.name == "Coca-Cola")
        #expect(products.first?.defaultPriceCents == 175)
    }

    @Test("nested Codable values survive a round trip")
    func nestedValuesRoundTrip() throws {
        let context = try makeContext()
        let commission = Commission(type: "percent", percentBps: 1000, flatCents: nil, basis: "gross")
        let address = PostalAddress(
            line1: "1 Elm St", city: "Fresno", state: "CA", zip: "93701",
            geo: GeoPoint(lat: 36.7, lng: -119.7)
        )
        context.insert(
            StoredLocation(id: "l1", name: "Elm St Gym", address: address, commission: commission)
        )
        try context.save()

        let stored = try #require(try context.fetch(FetchDescriptor<StoredLocation>()).first)

        #expect(stored.commission == commission)
        #expect(stored.commission?.kind == .percent)
        #expect(stored.address?.geo?.lat == 36.7)
    }

    @Test("planogram slots keep their order and Int cents")
    func planogramSlotsRoundTrip() throws {
        let context = try makeContext()
        let slots = [
            PlanogramSlot(slotCode: "A1", productId: "p1", par: 10, priceCents: 150),
            PlanogramSlot(slotCode: "A2", productId: "p2", par: 8, priceCents: 225),
        ]
        context.insert(
            StoredPlanogram(id: "pg1", machineId: "m1", effectiveFrom: .distantPast, slots: slots)
        )
        try context.save()

        let stored = try #require(try context.fetch(FetchDescriptor<StoredPlanogram>()).first)
        #expect(stored.slots == slots)
        #expect(stored.slots.map(\.slotCode) == ["A1", "A2"])
    }

    @Test("pack contents round-trip")
    func packContentsRoundTrip() throws {
        let context = try makeContext()
        let contents = [PackContent(productId: "p1", units: 35)]
        context.insert(StoredPack(id: "k1", name: "Kirkland Coke 35pk", barcodes: ["00028400044004"], contents: contents))
        try context.save()

        let stored = try #require(try context.fetch(FetchDescriptor<StoredPack>()).first)
        #expect(stored.contents == contents)
        #expect(stored.barcodes == ["00028400044004"])
    }

    /// Soft-deleted records are kept, not dropped on import. A visit line can
    /// reference a product that was deleted in the dashboard afterwards, and
    /// discarding it here is how the day's counts get lost.
    @Test("a soft-deleted record is still stored and fetchable")
    func softDeletedRecordsAreRetained() throws {
        let context = try makeContext()
        let deletedAt = Date(timeIntervalSince1970: 1_700_000_000)
        context.insert(
            StoredProduct(id: "p9", name: "Discontinued", category: "snack",
                          defaultPriceCents: 100, active: false, deletedAt: deletedAt)
        )
        try context.save()

        let stored = try #require(try context.fetch(FetchDescriptor<StoredProduct>()).first)
        #expect(stored.deletedAt == deletedAt)
        #expect(stored.active == false)
    }

    @Test("store metadata names the mirrored organization")
    func storeMetadataHoldsOrg() throws {
        let context = try makeContext()
        context.insert(StoreMetadata(orgId: "org_abc"))
        try context.save()

        let metadata = try #require(try context.fetch(FetchDescriptor<StoreMetadata>()).first)
        #expect(metadata.orgId == "org_abc")
        #expect(metadata.lastSyncedAt == nil)
    }
}
