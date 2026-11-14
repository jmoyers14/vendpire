import SwiftData

/// The device's mirrored catalog, read once per pass rather than per keystroke
/// — a search runs on every character typed.
///
/// A reference type on purpose: the purchase screen and both resolvers share
/// ONE, so a record created a level down is findable above. The cached models
/// are live, so only inserts and deletes need `invalidate()`.
@MainActor
final class MirrorCatalog {
    private var loaded: (products: [StoredProduct], packs: [StoredPack])?
    private var namesById: [String: String]?
    private var itemsWithPacks: [CatalogItem]?
    private var productItems: [CatalogItem]?

    /// A record was inserted or deleted underneath the screen — a refresh
    /// landed, or a resolver created or attached something.
    func invalidate() {
        loaded = nil
        namesById = nil
        itemsWithPacks = nil
        productItems = nil
    }

    func products(in context: ModelContext) -> [StoredProduct] {
        read(in: context).products
    }

    func packs(in context: ModelContext) -> [StoredPack] {
        read(in: context).packs
    }

    /// Both catalogs flattened into one ranked-search-ready list — or products
    /// alone, for a caller that cannot accept a pack as an answer. Memoized
    /// like the fetch behind it: this is what runs on every keystroke.
    func items(in context: ModelContext, includingPacks: Bool = true) -> [CatalogItem] {
        if includingPacks, let itemsWithPacks { return itemsWithPacks }
        if !includingPacks, let productItems { return productItems }

        let catalog = read(in: context)
        let items = CatalogSearch.items(
            products: catalog.products,
            packs: includingPacks ? catalog.packs : []
        )
        if includingPacks {
            itemsWithPacks = items
        } else {
            productItems = items
        }
        return items
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
