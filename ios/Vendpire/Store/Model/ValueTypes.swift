import Foundation

/// Value types embedded inside the stored models, mirroring the server's
/// sub-documents. SwiftData persists `Codable` structs as attributes, so these
/// keep the same shape the API sends rather than being flattened into columns.
///
/// `nonisolated` throughout: these are pure data with no actor affinity, and the
/// project's default isolation is MainActor (see ARCHITECTURE.md).

// MARK: - Shared

nonisolated struct GeoPoint: Codable, Equatable, Hashable, Sendable {
    var lat: Double
    var lng: Double
}

nonisolated struct PostalAddress: Codable, Equatable, Hashable, Sendable {
    var line1: String?
    var city: String?
    var state: String?
    var zip: String?
    /// From the Places resolve — enables route planning later.
    var geo: GeoPoint?
}

nonisolated struct ContactInfo: Codable, Equatable, Hashable, Sendable {
    var name: String?
    var phone: String?
    var email: String?
}

// MARK: - Location

/// What a location is owed. Percentages are **basis points** (1000 = 10%), never
/// a float, and flat amounts are `Int` cents — the money rule applies here too.
nonisolated struct Commission: Codable, Equatable, Hashable, Sendable {
    /// Raw rather than an enum so an unrecognised value from a newer server
    /// cannot fail decoding and make the whole location vanish. Same reasoning
    /// as the plan's "reference validation must be deleted-tolerant" rule:
    /// prefer showing the record over discarding it.
    var type: String
    var percentBps: Int?
    var flatCents: Int?
    /// What the percentage applies to: "gross" or "net" of card fees.
    var basis: String?

    enum Kind: String { case none, percent, flat }
    var kind: Kind? { Kind(rawValue: type) }
}

// MARK: - Machine

nonisolated struct CardReader: Codable, Equatable, Hashable, Sendable {
    var provider: String
    var deviceId: String
}

// MARK: - Pack

/// Maps a pack to the sellable units inside it, so a purchase of a pack can be
/// split into per-product unit costs.
nonisolated struct PackContent: Codable, Equatable, Hashable, Sendable {
    var productId: String
    var units: Int
}

// MARK: - Planogram

/// One slot's assignment in a planogram version: what's in it, how full it gets,
/// and what it sells for. `priceCents` is `Int` — never `Double`.
nonisolated struct PlanogramSlot: Codable, Equatable, Hashable, Sendable {
    var slotCode: String
    var productId: String
    /// Units the slot holds when full — the refill target.
    var par: Int
    var priceCents: Int
}
