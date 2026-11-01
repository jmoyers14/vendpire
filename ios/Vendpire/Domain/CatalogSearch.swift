import Foundation

/// Text search over the operator's OWN catalog — products and packs in one
/// ranked list — ported from `packages/web/src/screens/purchases/catalogSearch.ts`.
///
/// Deliberately matches on name only. Digits route to `ScanResolution` long
/// before they reach here, so matching codes would only ever create ambiguity.
nonisolated struct CatalogItem: Equatable, Identifiable, Sendable {
    enum Kind: Equatable, Sendable {
        case unit(imageUrl: String?)
        case pack(units: Int)
    }

    let kind: Kind
    let recordId: String
    let name: String
    /// Unit upc, or a pack's first case barcode. `nil` means "no code yet".
    let barcode: String?

    var isPack: Bool {
        if case .pack = kind { return true }
        return false
    }

    var id: String { "\(isPack ? "pack" : "unit")-\(recordId)" }
}

nonisolated enum CatalogSearch {
    static func item(for product: StoredProduct) -> CatalogItem {
        CatalogItem(
            kind: .unit(imageUrl: product.imageUrl),
            recordId: product.id,
            name: product.name,
            barcode: product.upc
        )
    }

    static func item(for pack: StoredPack) -> CatalogItem {
        CatalogItem(
            kind: .pack(units: pack.contents.reduce(0) { $0 + $1.units }),
            recordId: pack.id,
            name: pack.name,
            barcode: pack.barcodes.first
        )
    }

    /// Flatten both catalogs into one list the dropdown can render uniformly.
    /// Active only — a retired product or pack can't be bought again.
    static func items(products: [StoredProduct], packs: [StoredPack]) -> [CatalogItem] {
        products.filter(\.active).map { item(for: $0) }
            + packs.filter(\.active).map { item(for: $0) }
    }

    /// Every term must appear somewhere in the name, so "coke case" narrows
    /// rather than widens. Ties break toward the shorter name — the more
    /// specific match.
    static func search(_ items: [CatalogItem], query: String, limit: Int = 8) -> [CatalogItem] {
        let terms = query
            .trimmed
            .lowercased()
            .split(whereSeparator: \.isWhitespace)
            .map(String.init)
        guard !terms.isEmpty else { return [] }

        var scored: [(item: CatalogItem, score: Int)] = []
        for item in items {
            let name = item.name.lowercased()
            var total = 0
            var matchedAll = true
            for term in terms {
                guard let score = scoreTerm(name: name, term: term) else {
                    matchedAll = false
                    break
                }
                total += score
            }
            if matchedAll {
                scored.append((item, total))
            }
        }

        return scored
            .sorted { lhs, rhs in
                lhs.score != rhs.score ? lhs.score < rhs.score : lhs.item.name.count < rhs.item.name.count
            }
            .prefix(limit)
            .map(\.item)
    }

    /// Lower is better. Ranks where the term lands, so "coke" puts "Coke Zero"
    /// above "Diet Coke" above "Costco Coke Variety". `nil` means no match.
    private static func scoreTerm(name: String, term: String) -> Int? {
        guard let range = name.range(of: term) else { return nil }
        guard range.lowerBound != name.startIndex else {
            return name.count == term.count ? 0 : 1
        }
        let before = name.index(before: range.lowerBound)
        return name[before] == " " ? 2 : 3
    }
}
