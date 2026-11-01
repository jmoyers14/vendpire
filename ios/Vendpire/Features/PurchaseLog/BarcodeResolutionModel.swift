import Foundation
import SwiftData

/// One scanned code turned into one `CatalogItem` — by a mirror hit, by
/// attaching the code to a record that already existed, or by creating one.
///
/// `allowsPacks` is the only difference between the two levels, and it is also
/// what bounds the nesting: a resolver that cannot answer with a pack never
/// offers to create one. The outcome is reported through `onResolve`, never
/// applied, so one type serves both a purchase row and a pack content row.
@MainActor
@Observable
final class BarcodeResolutionModel {
    /// Without `configure(api:)` the network actions can do nothing, and a
    /// silent no-op reads as a missed tap.
    private static let notConnectedMessage = "Not connected yet — close and reopen the screen"

    /// A scanned code with nothing behind it yet. Held until the sheet either
    /// attaches it to an existing record or creates the one it belongs to.
    nonisolated struct PendingScan: Equatable, Sendable {
        let gtin14: String
        /// A case-level GTIN-14. Carried for the sheet to lean on; it does
        /// not pick a branch today.
        let likelyCase: Bool
        /// What an outside barcode database guessed, when it recognised the
        /// code. Arrives late, or never.
        var candidate: RemoteCandidate?
    }

    /// One product inside a case being created. `productId` is non-optional
    /// because a row is only appended once a product resolves, so a row can
    /// never be blank.
    nonisolated struct PackContentDraft: Identifiable, Equatable, Sendable {
        /// Identity only: binding by id keeps a deletion from re-pointing a
        /// binding at the row that slid into its index.
        let id = UUID()
        let productId: String
        /// Denormalized when the row was added, so rendering never goes back to
        /// the mirror — the same thing `PurchaseRow` does.
        let name: String
        var unitsText: String
    }

    /// Whether a pack is an answer this resolver can give. False one level down,
    /// where the question is "which product is in this case".
    let allowsPacks: Bool

    /// What a resolved item means to the caller. Set once, by the owner, right
    /// after construction — a closure passed to `init` could not capture an
    /// owner that isn't finished initializing yet.
    @ObservationIgnored
    var onResolve: ((CatalogItem) -> Void)?

    /// "It's a case of items" committed to on the spot: there is nothing to
    /// resolve yet, so this hands the caller a dedicated resolver carrying
    /// the scanned code and candidate, for a draft row to hold onto until the
    /// case's contents are done. See `commitPendingCase`.
    @ObservationIgnored
    var onCommitPackDraft: ((BarcodeResolutionModel) -> Void)?

    /// Set means the sheet is up.
    private(set) var pendingScan: PendingScan?

    /// A fresh id on every read the scanner let through. Feedback hangs off the
    /// read, not the outcome — an unknown code adds nothing to report but still
    /// has to buzz.
    private(set) var lastReadId: UUID?
    private(set) var errorMessage: String?
    /// The status behind `errorMessage`, when it came from the server. 409 is
    /// the one the sheet acts on: the scanned code is already on another
    /// record, and attaching to THAT record is the way out.
    private(set) var errorStatusCode: Int?

    /// The in-flight candidate lookup. Exposed so a test can await it — the
    /// screen never reads it, because a candidate is a suggestion that must
    /// never gate entry.
    private(set) var candidateFetch: Task<Void, Never>?

    /// The case being created, once the operator has said it is a case. Only
    /// ever non-empty on a resolver that allows packs.
    private(set) var contents: [PackContentDraft] = []

    /// Which door the operator took into the inner flow. The two differ only in
    /// where the flow starts — a camera, or a blank create form for a product
    /// whose bag has no barcode at all.
    nonisolated enum ContentDoor: Equatable, Sendable {
        case scanner
        case blankCreate
    }

    /// The resolver for one product inside the case, alive while its flow is on
    /// screen. Never allows packs, which is where the recursion stops.
    private(set) var contentResolver: BarcodeResolutionModel?
    private(set) var contentDoor: ContentDoor?

    /// Shared with the owning screen, so a record created here is findable
    /// above without a refresh.
    @ObservationIgnored
    private let catalog: MirrorCatalog

    @ObservationIgnored
    private var api: (any VendpireAPI)?

    init(allowsPacks: Bool, catalog: MirrorCatalog) {
        self.allowsPacks = allowsPacks
        self.catalog = catalog
    }

    // MARK: - Wiring

    func configure(api: any VendpireAPI) {
        self.api = api
        contentResolver?.configure(api: api)
    }

    // MARK: - Resolving a code

    /// Resolve a scanned or typed code against the mirror. A hit reports the
    /// item; a miss parks the code for the sheet; garbage says so and changes
    /// nothing else.
    func resolve(_ code: String, context: ModelContext) {
        clearError()
        lastReadId = UUID()

        // Unfiltered on purpose, unlike `CatalogSearch.items`: a box in the cart
        // is a fact, so a retired product still resolves by scan even though
        // the search list no longer offers it.
        let products = catalog.products(in: context)
        let packs = catalog.packs(in: context)
        switch ScanResolution.resolve(code, products: products, packs: packs) {
        case .product(let id):
            guard let product = products.first(where: { $0.id == id }) else { return }
            report(item(for: product))
        case .pack(let id):
            // One level down the question is which PRODUCT is in the case, so a
            // case code is the operator scanning the outer box a second time.
            guard allowsPacks else {
                errorMessage = "That's a case, not an item — scan one of the products inside it"
                return
            }
            guard let pack = packs.first(where: { $0.id == id }) else { return }
            report(item(for: pack))
        case .unknown(let gtin14, let likelyCase):
            // Not an error — it is a question the sheet asks.
            pendingScan = PendingScan(gtin14: gtin14, likelyCase: likelyCase, candidate: nil)
            fetchCandidate(for: gtin14)
        case .invalid:
            errorMessage = "\"\(code)\" isn't a valid barcode — check the digits"
        }
    }

    func dismissPendingScan() {
        candidateFetch?.cancel()
        candidateFetch = nil
        pendingScan = nil
    }

    /// Committing to "a case" is immediate and creates nothing: a dedicated
    /// resolver carries the scanned code and candidate off to whoever is
    /// tracking draft rows, and this one resets to resolve the next scan —
    /// the same screen's sheet never has to close.
    func commitPendingCase() {
        guard let scan = pendingScan else { return }
        let draft = BarcodeResolutionModel(allowsPacks: true, catalog: catalog)
        draft.pendingScan = scan
        if let api { draft.configure(api: api) }
        dismissPendingScan()
        onCommitPackDraft?(draft)
    }

    /// The name-ranked list the attach step picks from. Packs are included
    /// where a pack is a legal answer; the contents search passes `false`
    /// explicitly, because a case cannot contain a case.
    func searchResults(
        query: String,
        context: ModelContext,
        includingPacks: Bool? = nil
    ) -> [CatalogItem] {
        let items = catalog.items(in: context, includingPacks: includingPacks ?? allowsPacks)
        return CatalogSearch.search(items, query: query)
    }

    // MARK: - Attach

    /// Attach the scanned code to a record that already exists, mirror the
    /// updated record, and report it.
    func attach(to item: CatalogItem, context: ModelContext) async {
        // No pending scan means no code to attach, so nothing asked for this.
        guard let scan = pendingScan else { return }
        guard let api else {
            errorMessage = Self.notConnectedMessage
            return
        }
        clearError()
        // Success or partial failure, anything upserted must be findable.
        defer { catalog.invalidate() }

        do {
            let writer = MirrorWriter(context: context)
            switch item.kind {
            case .unit:
                let product = try await api.attachProductBarcode(
                    productId: item.recordId, code: scan.gtin14
                )
                try writer.upsert(product)
                report(self.item(for: product))
            case .pack:
                let pack = try await api.attachPackBarcode(packId: item.recordId, code: scan.gtin14)
                try writer.upsert(pack)
                report(self.item(for: pack))
            }
        } catch {
            // The sheet stays open either way, showing the server's own
            // sentence — see `report(_ error:)`.
            report(error)
        }
    }

    // MARK: - Create

    /// Create a single product. Carries the scanned code when there is one —
    /// the inner editor's "a product with no barcode" door has none, and a null
    /// `upc` is exactly right there.
    func createUnit(
        name: String,
        category: String,
        priceText: String,
        context: ModelContext
    ) async {
        guard let api else {
            errorMessage = Self.notConnectedMessage
            return
        }
        clearError()

        let productName = name.trimmed
        let productCategory = category.trimmed
        guard !productName.isEmpty, !productCategory.isEmpty else {
            errorMessage = "Name and category are required"
            return
        }

        // The price only seeds a planogram slot, where the real number is set,
        // so a blank field means "decide later" and parses as zero. A non-blank
        // field that doesn't parse is a typo, not a decision — refusing it
        // beats silently creating a product priced at nothing.
        let typedPrice = priceText.trimmed
        guard let defaultPriceCents = typedPrice.isEmpty ? 0 : Money.parseDollarsToCents(typedPrice)
        else {
            errorMessage = "Sell price must be a dollar amount (e.g. 1.75), or left blank"
            return
        }

        // Success or partial failure, anything upserted must be findable.
        defer { catalog.invalidate() }

        let draft = RemoteProductDraft(
            name: productName,
            upc: pendingScan?.gtin14,
            category: productCategory,
            taxClass: nil,
            imageUrl: pendingScan?.candidate?.imageUrl,
            defaultPriceCents: defaultPriceCents
        )

        do {
            let created = try await api.createProduct(draft)
            try MirrorWriter(context: context).upsert(created)
            report(item(for: created))
        } catch {
            report(error)
        }
    }

    /// Create the case the scanned code names. Every content row already holds
    /// a real product — they were created or attached as they were resolved —
    /// so this creates the pack and nothing else.
    func createPack(name: String, context: ModelContext) async {
        // The pack's barcode IS the scanned code; without one there is no case.
        guard let scan = pendingScan else { return }
        guard let api else {
            errorMessage = Self.notConnectedMessage
            return
        }
        clearError()

        let packName = name.trimmed
        guard !packName.isEmpty else {
            errorMessage = "Give the case a name"
            return
        }

        guard let packContents = validateContents() else { return }

        defer { catalog.invalidate() }

        do {
            let draft = RemotePackDraft(
                name: packName, barcodes: [scan.gtin14], contents: packContents
            )
            let created = try await api.createPack(draft)
            try MirrorWriter(context: context).upsert(created)
            report(item(for: created))
        } catch {
            report(error)
        }
    }

    /// Every row's units parsed, or nil with `errorMessage` naming the row the
    /// operator sees.
    private func validateContents() -> [PackContent]? {
        guard !contents.isEmpty else {
            errorMessage = "Add at least one product to the case"
            return nil
        }

        var prepared: [PackContent] = []
        for (offset, content) in contents.enumerated() {
            guard let units = Int(content.unitsText.trimmed), units >= 1 else {
                errorMessage = "Product \(offset + 1): units must be a whole number"
                return nil
            }
            prepared.append(PackContent(productId: content.productId, units: units))
        }
        return prepared
    }

    // MARK: - The case's contents

    /// Open the inner flow: one product of the case, resolved by the same tree
    /// one level down. Packs are refused there, which is where recursion stops.
    func beginContentResolution(through door: ContentDoor) {
        guard allowsPacks else { return }

        let resolver = BarcodeResolutionModel(allowsPacks: false, catalog: catalog)
        resolver.onResolve = { [weak self] item in
            self?.addContent(item)
            self?.endContentResolution()
        }
        if let api { resolver.configure(api: api) }
        contentDoor = door
        contentResolver = resolver
    }

    func endContentResolution() {
        contentResolver?.dismissPendingScan()
        contentResolver = nil
        contentDoor = nil
    }

    /// A resolved product becomes a row. Rescanning one already in the case
    /// bumps nothing — units are typed per row, and two rows for one product
    /// would only confuse the split.
    func addContent(_ item: CatalogItem) {
        guard !item.isPack, !contents.contains(where: { $0.productId == item.recordId }) else {
            return
        }
        contents.append(
            PackContentDraft(productId: item.recordId, name: item.name, unitsText: "")
        )
    }

    func updateContent(id: UUID, unitsText: String) {
        guard let index = contents.firstIndex(where: { $0.id == id }) else { return }
        contents[index].unitsText = unitsText
    }

    func removeContent(id: UUID) {
        contents.removeAll { $0.id == id }
    }

    // MARK: - Reporting

    /// Hand the resolved item to whoever asked, and close the question.
    private func report(_ item: CatalogItem) {
        dismissPendingScan()
        onResolve?(item)
    }

    /// The server's own sentence, verbatim — a 409 from the catalog edge names
    /// the record the scanned code is already on, and that name is what the
    /// sheet's one-tap recovery offers. The status rides along so the sheet can
    /// recognise the conflict without matching prose.
    private func report(_ error: any Error) {
        errorMessage = error.localizedDescription
        errorStatusCode = (error as? VendpireAPIError)?.statusCode
    }

    private func clearError() {
        errorMessage = nil
        errorStatusCode = nil
    }

    // MARK: - The outside guess

    /// A guess from an outside barcode database, fetched alongside the sheet
    /// rather than before it. A failure leaves `candidate` nil and blocks
    /// nothing — the operator can always just say what the thing is.
    private func fetchCandidate(for gtin14: String) {
        candidateFetch?.cancel()
        candidateFetch = nil
        guard let api else { return }

        candidateFetch = Task { [weak self] in
            let found = try? await api.fetchBarcodeCandidate(code: gtin14)
            // The operator may have dismissed or rescanned while this was in
            // flight; a late answer must not land on a different code.
            guard let self, self.pendingScan?.gtin14 == gtin14 else { return }
            self.pendingScan?.candidate = found
        }
    }

    // MARK: - Items

    private func item(for product: StoredProduct) -> CatalogItem {
        CatalogSearch.item(for: product)
    }

    private func item(for pack: StoredPack) -> CatalogItem {
        CatalogSearch.item(for: pack)
    }

    private func item(for product: RemoteProduct) -> CatalogItem {
        CatalogItem(
            kind: .unit(imageUrl: product.imageUrl),
            recordId: product.id,
            name: product.name,
            barcode: product.upc
        )
    }

    private func item(for pack: RemotePack) -> CatalogItem {
        CatalogItem(
            kind: .pack(units: pack.contents.reduce(0) { $0 + $1.units }),
            recordId: pack.id,
            name: pack.name,
            barcode: pack.barcodes.first
        )
    }
}
