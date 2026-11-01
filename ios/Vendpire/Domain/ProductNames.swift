import Foundation

/// The one id→name lookup both capture screens build from the mirror, so the
/// duplicate-id rule (first wins) and the missing-name fallback are stated
/// once.
nonisolated enum ProductNames {
    static let unknown = "Unknown product"

    static func byId(_ products: [StoredProduct]) -> [String: String] {
        Dictionary(products.map { ($0.id, $0.name) }) { first, _ in first }
    }
}
