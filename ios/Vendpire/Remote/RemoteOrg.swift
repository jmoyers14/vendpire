import Foundation

/// One organization's reference data in its wire shape, matching what the API
/// serializes. `MirrorWriter` is the only thing that turns it into `Stored*`
/// rows.
///
/// Fields the device has no use for (`createdAt`, `templateId`) are omitted;
/// `Decodable` ignores them.
nonisolated struct RemoteOrg: Decodable, Sendable {
    let orgId: String
    let locations: [RemoteLocation]
    let machines: [RemoteMachine]
    let products: [RemoteProduct]
    let packs: [RemotePack]
    let planograms: [RemotePlanogram]
}

nonisolated struct RemoteLocation: Decodable, Sendable {
    let id: String
    let name: String
    let address: PostalAddress?
    let contact: ContactInfo?
    let commission: Commission?
    let notes: String?
    let active: Bool
    let deletedAt: Date?
    let updatedAt: Date?
}

nonisolated struct RemoteMachine: Decodable, Sendable {
    let id: String
    let locationId: String
    let name: String
    let kind: String
    let make: String?
    let model: String?
    let serial: String?
    let tagCode: String?
    /// One array per shelf, in walking order. Carried through untouched —
    /// layout is never inferred from the codes.
    let slots: [[String]]
    let cardReader: CardReader?
    let active: Bool
    let deletedAt: Date?
    let updatedAt: Date?
}

nonisolated struct RemoteProduct: Decodable, Sendable {
    let id: String
    let name: String
    let upc: String?
    let category: String
    let taxClass: String?
    let imageUrl: String?
    let defaultPriceCents: Int
    let active: Bool
    let deletedAt: Date?
    let updatedAt: Date?
}

nonisolated struct RemotePack: Decodable, Sendable {
    let id: String
    let name: String
    let barcodes: [String]
    let contents: [PackContent]
    let active: Bool
    let deletedAt: Date?
    let updatedAt: Date?
}

nonisolated struct RemotePlanogram: Decodable, Sendable {
    let id: String
    let machineId: String
    let effectiveFrom: Date
    let slots: [PlanogramSlot]
    let deletedAt: Date?
    let updatedAt: Date?
}

extension RemoteOrg {
    /// The server emits ISO-8601 with fractional seconds (`...T03:20:04.397Z`),
    /// which `.iso8601` rejects outright — failing the payload on its first
    /// timestamp. Both forms are accepted.
    static func makeDecoder() -> JSONDecoder {
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .custom { decoder in
            let container = try decoder.singleValueContainer()
            let text = try container.decode(String.self)
            if let date = RemoteDate.withFractionalSeconds.date(from: text) { return date }
            if let date = RemoteDate.plain.date(from: text) { return date }
            throw DecodingError.dataCorruptedError(
                in: container,
                debugDescription: "Expected an ISO-8601 date, got \(text)"
            )
        }
        return decoder
    }
}

/// The two formatters the decode needs, built once.
///
/// `nonisolated(unsafe)` because `ISO8601DateFormatter` is not `Sendable` yet is
/// documented as safe for concurrent parsing — the same guarantee `DateFormatter`
/// has carried since iOS 7. The alternative is constructing a formatter per
/// timestamp inside the decoding closure, which is pure waste on a payload that
/// is mostly dates.
private enum RemoteDate {
    nonisolated(unsafe) static let withFractionalSeconds: ISO8601DateFormatter = {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return formatter
    }()

    nonisolated(unsafe) static let plain: ISO8601DateFormatter = {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime]
        return formatter
    }()
}

/// A machine's most recent visit. Only the fields the phone reads — the server
/// sends more, and `Decodable` ignores the rest.
nonisolated struct RemoteVisit: Decodable, Sendable {
    let id: String
    let machineId: String
    let countedAt: Date
    let lines: [VisitLine]
}

/// The signed-in principal, as the server sees it.
///
/// A null `orgId` is a real state, not an error: it is how a member-less user
/// learns why nothing syncs.
nonisolated struct RemoteIdentity: Decodable, Sendable {
    let userId: String
    let orgId: String?
}
