import SwiftData

/// The device's mirrored catalog, read once per pass rather than per keystroke:
/// a search runs on every character typed and a split preview on every pack row
/// per render, and neither should reach SwiftData each time.
///
/// A reference type on purpose. The purchase screen and both of its resolvers
/// share ONE of these, because a product created or attached one level down has
/// to be findable everywhere above it — and three private caches cannot
/// invalidate each other.
///
/// The cached models are live, so field edits show through. Only inserts and
/// deletes need `didChange()`.
@MainActor
final class MirrorCatalog {
    private var loaded: (products: [StoredProduct], packs: [StoredPack])?
    private var namesById: [String: String]?

    /// A record was inserted or deleted underneath the screen — a refresh
    /// landed, or a resolver created or attached something.
    func didChange() {
        loaded = nil
        namesById = nil
    }

    func products(in context: ModelContext) -> [StoredProduct] {
        read(in: context).products
    }

    func packs(in context: ModelContext) -> [StoredPack] {
        read(in: context).packs
    }

    /// Both catalogs flattened into one ranked-search-ready list — or products
    /// alone, for a caller that cannot accept a pack as an answer.
    func items(in context: ModelContext, includingPacks: Bool = true) -> [CatalogItem] {
        let catalog = read(in: context)
        return CatalogSearch.items(
            products: catalog.products,
            packs: includingPacks ? catalog.packs : []
        )
    }

    func productNames(in context: ModelContext) -> [String: String] {
        if let namesById { return namesById }

        let names = ProductNames.byId(read(in: context).products)
        namesById = names
        return names
    }

    private func read(
        in context: ModelContext
    ) -> (products: [StoredProduct], packs: [StoredPack]) {
        if let loaded { return loaded }

        let catalog = (
            products: (try? context.fetch(FetchDescriptor<StoredProduct>())) ?? [],
            packs: (try? context.fetch(FetchDescriptor<StoredPack>())) ?? []
        )
        loaded = catalog
        return catalog
    }
}
