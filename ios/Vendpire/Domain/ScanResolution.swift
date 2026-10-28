import Foundation

/// What a scanned (or typed) code resolves to against the device's mirrored
/// catalog — the resolver's first two arms, relocated on-device so a scan
/// during capture doesn't need a round trip.
///
/// Precedence matches the server exactly: a product wins over a pack when a
/// code somehow lands on both, because a product is always what a human
/// counted, and a pack is only ever a receiving aid.
nonisolated enum ScanResolution: Equatable, Sendable {
    case product(id: String)
    case pack(id: String)
    case unknown(gtin14: String, likelyCase: Bool)
    case invalid

    static func resolve(_ raw: String, products: [StoredProduct], packs: [StoredPack]) -> ScanResolution {
        guard let normalized = Gtin.normalize(raw) else { return .invalid }
        if let product = products.first(where: { $0.upc == normalized.gtin14 }) {
            return .product(id: product.id)
        }
        if let pack = packs.first(where: { $0.barcodes.contains(normalized.gtin14) }) {
            return .pack(id: pack.id)
        }
        return .unknown(gtin14: normalized.gtin14, likelyCase: normalized.likelyCase)
    }
}
