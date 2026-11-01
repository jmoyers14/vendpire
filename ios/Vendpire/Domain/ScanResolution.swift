import Foundation

/// What a scanned or typed code resolves to against the device's mirrored
/// catalog, so a scan needs no round trip.
///
/// A product wins over a pack when a code lands on both, matching the server's
/// precedence.
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
