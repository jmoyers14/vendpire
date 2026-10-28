import Foundation
import SwiftData

/// The purchase screen's state and every mutation of it — the `VisitCaptureModel`
/// pattern applied to the receiving side: `@MainActor @Observable`, zero-arg
/// init, `ModelContext` passed per call.
///
/// Two rules run through all of it:
///
/// - **The phone never splits money.** Unit rows become `lines`, pack rows
///   become `packLines`, and the server's `expandPackLines` stays the only
///   thing that turns a case into per-product cost. `Allocate` appears here
///   once, in `splitPreview`, and that number is never submitted.
/// - **`clientRequestId` is minted once, in `init`.** A second successful save
///   is impossible: the screen dismisses on the first one, so a later call is
///   a double-tap rather than a request.
@MainActor
@Observable
final class PurchaseLogModel {
    /// Most runs are a Costco trip. A starting point, not a constraint.
    private static let defaultVendor = "Costco"

    /// What a row shows when the mirror has no name for the id — the same
    /// fallback visit capture uses.
    private static let unknownProductName = "Unknown product"

    /// A scanned code with nothing behind it yet. Held until the not-found
    /// sheet either attaches it to an existing record or creates the one it
    /// belongs to.
    nonisolated struct PendingScan: Equatable, Sendable {
        let gtin14: String
        /// A case-level code, so the sheet opens on "a case".
        let likelyCase: Bool
        /// What an outside barcode database guessed, when it recognised the
        /// code. Arrives late, or never.
        var candidate: RemoteCandidate?
    }

    /// One line of a case's contents, as the sheet collects it. A variety pack
    /// has several, each either an existing product or one being created here
    /// — which is why the new-product fields live on the row rather than on
    /// the sheet.
    nonisolated struct NewPackContent: Equatable, Sendable {
        /// An existing product, or nil to create one from the fields below.
        var productId: String?
        var unitsText: String
        var name: String
        var category: String
        /// The single bag's own code — never the case code just scanned.
        var bagCode: String
    }

    // MARK: - Entry state

    var vendor: String = PurchaseLogModel.defaultVendor
    var purchasedDate: Date = Date()
    var notes: String = ""
    var receiptTotalText: String = ""

    private(set) var rows: [PurchaseRow] = []
    /// Set means the not-found sheet is up.
    private(set) var pendingScan: PendingScan?
    private(set) var errorMessage: String?

    /// Minted when the screen opens, not at save time: double-tapping Save
    /// sends the SAME key twice, and the server returns the first purchase
    /// instead of writing a second one.
    let clientRequestId = UUID().uuidString

    /// True once a draft has reached the outbox. The first success is terminal
    /// for the screen.
    private(set) var isSaved = false

    /// The in-flight candidate lookup. Exposed so a test can await it — the
    /// screen never reads it, because a candidate is a suggestion that must
    /// never gate entry.
    private(set) var candidateFetch: Task<Void, Never>?

    @ObservationIgnored
    private var api: (any VendpireAPI)?

    // MARK: - What the screen reads

    /// Unparseable rows count as zero so the running total keeps up with
    /// typing instead of blanking out mid-keystroke. `save` is where a
    /// half-typed cost is actually refused.
    var enteredCents: Int {
        rows.reduce(0) { total, row in total + (Money.parseDollarsToCents(row.totalCostText) ?? 0) }
    }

    /// Entered minus receipt: positive means the lines add up to more than the
    /// receipt says. Nil without a parseable total — there is nothing to
    /// reconcile against yet.
    var varianceCents: Int? {
        guard !receiptTotalText.trimmed.isEmpty,
              let receiptCents = Money.parseDollarsToCents(receiptTotalText)
        else { return nil }

        return enteredCents - receiptCents
    }

    /// How a pack row's cost will be split across its contents, for display
    /// while the operator types. The same allocator the server runs, so the
    /// numbers previewed are the numbers stored — but the server's expansion
    /// stays authoritative, and nothing from here is ever submitted.
    ///
    /// Nil while the row is incomplete: a half-typed cost must not flash a
    /// wrong split.
    func splitPreview(
        for row: PurchaseRow,
        context: ModelContext
    ) -> [(name: String, units: Int, cents: Int)]? {
        guard row.kind == .pack,
              let quantity = Int(row.quantityText.trimmed), quantity >= 1,
              let totalCostCents = Money.parseDollarsToCents(row.totalCostText),
              let pack = storedPacks(in: context).first(where: { $0.id == row.recordId })
        else { return nil }

        let weights = pack.contents.map { $0.units * quantity }
        let shares = Allocate.proportionally(totalCents: totalCostCents, weights: weights)
        let names = productNames(in: context)
        return pack.contents.enumerated().map { index, content in
            (
                name: names[content.productId] ?? Self.unknownProductName,
                units: content.units * quantity,
                cents: shares[index]
            )
        }
    }

    func searchResults(query: String, context: ModelContext) -> [CatalogItem] {
        let items = CatalogSearch.items(
            products: storedProducts(in: context),
            packs: storedPacks(in: context)
        )
        return CatalogSearch.search(items, query: query)
    }

    // MARK: - Wiring

    /// Injected once from the view, which owns the client. Everything the
    /// model does offline works without it.
    func configure(api: any VendpireAPI) {
        self.api = api
    }

    // MARK: - Adding lines

    /// Resolve a scanned or typed code against the mirror. A hit adds or bumps
    /// a row; a miss parks the code for the sheet; garbage says so and changes
    /// nothing else.
    func handleScan(_ code: String, context: ModelContext) {
        errorMessage = nil

        let products = storedProducts(in: context)
        let packs = storedPacks(in: context)
        switch ScanResolution.resolve(code, products: products, packs: packs) {
        case .product(let id):
            let name = products.first { $0.id == id }?.name ?? Self.unknownProductName
            addOrIncrementRow(kind: .unit, recordId: id, name: name)
        case .pack(let id):
            let name = packs.first { $0.id == id }?.name ?? Self.unknownProductName
            addOrIncrementRow(kind: .pack, recordId: id, name: name)
        case .unknown(let gtin14, let likelyCase):
            // Not an error — it is a question the sheet asks.
            pendingScan = PendingScan(gtin14: gtin14, likelyCase: likelyCase, candidate: nil)
            fetchCandidate(for: gtin14)
        case .invalid:
            errorMessage = "\"\(code)\" isn't a valid barcode — check the digits"
        }
    }

    /// A result picked by name. Always a new row rather than an increment: the
    /// same product can legitimately appear twice on one receipt at two
    /// prices, and searching for it again is the only way to say so.
    func add(_ item: CatalogItem) {
        errorMessage = nil
        rows.append(
            PurchaseRow(kind: item.isPack ? .pack : .unit, recordId: item.recordId, name: item.name)
        )
    }

    /// Patch form: the view edits one field at a time, and an untouched field
    /// must not be overwritten with a stale copy of itself.
    func updateRow(id: UUID, quantityText: String? = nil, totalCostText: String? = nil) {
        guard let index = rows.firstIndex(where: { $0.id == id }) else { return }

        if let quantityText { rows[index].quantityText = quantityText }
        if let totalCostText { rows[index].totalCostText = totalCostText }
    }

    func removeRow(id: UUID) {
        rows.removeAll { $0.id == id }
    }

    func dismissPendingScan() {
        candidateFetch?.cancel()
        candidateFetch = nil
        pendingScan = nil
    }

    // MARK: - Resolving an unknown code

    /// Attach the scanned code to a record that already exists, mirror the
    /// updated record, and add its row.
    func attach(to item: CatalogItem, context: ModelContext) async {
        guard let api, let scan = pendingScan else { return }
        errorMessage = nil

        do {
            let writer = MirrorWriter(context: context)
            switch item.kind {
            case .unit:
                let product = try await api.attachProductBarcode(
                    productId: item.recordId, code: scan.gtin14
                )
                try writer.upsert(product)
                addOrIncrementRow(kind: .unit, recordId: product.id, name: product.name)
            case .pack:
                let pack = try await api.attachPackBarcode(packId: item.recordId, code: scan.gtin14)
                try writer.upsert(pack)
                addOrIncrementRow(kind: .pack, recordId: pack.id, name: pack.name)
            }
            dismissPendingScan()
        } catch {
            // Verbatim, including the server's "already attached to …" — the
            // record name inside that message is what the sheet's one-tap
            // recovery is built on. The sheet stays open either way.
            errorMessage = error.localizedDescription
        }
    }

    /// Create the single product the scanned code names.
    func createUnit(
        name: String,
        category: String,
        priceText: String,
        context: ModelContext
    ) async {
        guard let api, let scan = pendingScan else { return }
        errorMessage = nil

        let productName = name.trimmed
        let productCategory = category.trimmed
        guard !productName.isEmpty, !productCategory.isEmpty else {
            errorMessage = "Name and category are required"
            return
        }

        let draft = RemoteProductDraft(
            name: productName,
            upc: scan.gtin14,
            category: productCategory,
            taxClass: nil,
            imageUrl: scan.candidate?.imageUrl,
            // The price only seeds a planogram slot, where the real number is
            // set. A blank field means "decide later", not zero-on-purpose.
            defaultPriceCents: Money.parseDollarsToCents(priceText) ?? 0
        )

        do {
            let created = try await api.createProduct(draft)
            try MirrorWriter(context: context).upsert(created)
            addOrIncrementRow(kind: .unit, recordId: created.id, name: created.name)
            dismissPendingScan()
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    /// Create the case the scanned code names. Rows without a product id
    /// become products first, then the pack is created pointing at them.
    ///
    /// A failure partway leaves those products behind, mirrored: they are
    /// records the operator wanted anyway, and a rerun picks them out of the
    /// mirror rather than duplicating them.
    func createPack(name: String, contents: [NewPackContent], context: ModelContext) async {
        guard let api, let scan = pendingScan else { return }
        errorMessage = nil

        let packName = name.trimmed
        guard !packName.isEmpty else {
            errorMessage = "Give the case a name"
            return
        }

        guard let prepared = prepare(contents) else { return }

        do {
            let writer = MirrorWriter(context: context)
            var packContents: [PackContent] = []
            for content in prepared {
                if let productId = content.productId {
                    packContents.append(PackContent(productId: productId, units: content.units))
                    continue
                }

                let draft = RemoteProductDraft(
                    name: content.name,
                    upc: content.bagCode,
                    category: content.category,
                    taxClass: nil,
                    // The scanned image is of the CASE, so it only describes
                    // the contents when the case holds one product.
                    imageUrl: prepared.count == 1 ? scan.candidate?.imageUrl : nil,
                    defaultPriceCents: 0
                )
                let created = try await api.createProduct(draft)
                // Mirrored one at a time, so a failure further down this loop
                // still leaves every product it already created findable.
                try writer.upsert(created)
                packContents.append(PackContent(productId: created.id, units: content.units))
            }

            let packDraft = RemotePackDraft(
                name: packName, barcodes: [scan.gtin14], contents: packContents
            )
            let created = try await api.createPack(packDraft)
            try writer.upsert(created)
            addOrIncrementRow(kind: .pack, recordId: created.id, name: created.name)
            dismissPendingScan()
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    // MARK: - Saving

    /// Validate every row, build the submission, and enqueue it. Returns true
    /// only when a draft actually reached the outbox — the view dismisses on
    /// that.
    func save(context: ModelContext) -> Bool {
        // The screen dismisses on the first success, so a later call is a
        // double-tap and not a request. Silent: there is nothing to report.
        guard !isSaved else { return false }

        errorMessage = nil

        let vendorName = vendor.trimmed
        guard !vendorName.isEmpty else {
            errorMessage = "Vendor is required"
            return false
        }

        var lines: [PurchaseSubmissionLine] = []
        var packLines: [PurchaseSubmissionPackLine] = []
        for (index, row) in rows.enumerated() {
            let number = index + 1
            guard let totalCostCents = Money.parseDollarsToCents(row.totalCostText) else {
                errorMessage = "Line \(number): cost must be a dollar amount"
                return false
            }
            guard let quantity = Int(row.quantityText.trimmed), quantity >= 1 else {
                let noun = row.kind == .pack ? "cases" : "units"
                errorMessage = "Line \(number): \(noun) must be a whole number"
                return false
            }

            switch row.kind {
            case .unit:
                // `packId` stays nil: provenance is a server-side fact about
                // an expanded pack line, and the phone has no business
                // claiming one.
                lines.append(
                    PurchaseSubmissionLine(
                        productId: row.recordId, units: quantity,
                        totalCostCents: totalCostCents, packId: nil
                    )
                )
            case .pack:
                // Unexpanded, on purpose. `expandPackLines` is the server's.
                packLines.append(
                    PurchaseSubmissionPackLine(
                        packId: row.recordId, qty: quantity, totalCostCents: totalCostCents
                    )
                )
            }
        }

        guard !lines.isEmpty || !packLines.isEmpty else {
            errorMessage = "Scan a barcode or add an item to get started"
            return false
        }

        let trimmedNotes = notes.trimmed
        let submission = PurchaseSubmission(
            purchasedAt: middayOnPurchasedDate,
            vendor: vendorName,
            lines: lines,
            packLines: packLines,
            receiptTotalCents: receiptTotalText.trimmed.isEmpty
                ? nil
                : Money.parseDollarsToCents(receiptTotalText),
            notes: trimmedNotes.isEmpty ? nil : trimmedNotes,
            clientRequestId: clientRequestId
        )

        do {
            let item = try OutboxItem(purchase: submission)
            context.insert(item)
            try context.save()
        } catch {
            errorMessage = error.localizedDescription
            return false
        }

        isSaved = true
        return true
    }

    /// Midday rather than midnight: the picker yields a bare calendar day, and
    /// anchoring it at noon keeps the stored instant on that same day across
    /// every US timezone instead of slipping a day either side of UTC. The
    /// web's `T12:00:00` suffix is the same trick.
    private var middayOnPurchasedDate: Date {
        Calendar.current.date(bySettingHour: 12, minute: 0, second: 0, of: purchasedDate)
            ?? purchasedDate
    }

    // MARK: - Rows

    /// A second scan of the same thing means two of it, not a second line to
    /// reconcile against one receipt entry.
    private func addOrIncrementRow(kind: PurchaseRow.Kind, recordId: String, name: String) {
        guard let index = rows.firstIndex(where: { $0.kind == kind && $0.recordId == recordId })
        else {
            rows.append(PurchaseRow(kind: kind, recordId: recordId, name: name))
            return
        }

        rows[index].quantityText = String((Int(rows[index].quantityText.trimmed) ?? 0) + 1)
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

    // MARK: - New pack contents

    /// A `NewPackContent` with its text parsed and its codes normalized —
    /// every row validated before the first product is created, so a bad row
    /// three down doesn't strand two half-created products.
    private struct PreparedContent {
        /// Nil means "create it", using the fields below.
        let productId: String?
        let units: Int
        let name: String
        let category: String
        let bagCode: String?
    }

    /// Nil means validation failed and `errorMessage` says which row.
    private func prepare(_ contents: [NewPackContent]) -> [PreparedContent]? {
        let entered = contents.filter { content in
            content.productId != nil || !content.unitsText.trimmed.isEmpty
                || !content.name.trimmed.isEmpty
        }
        guard !entered.isEmpty else {
            errorMessage = "Add at least one product to the case"
            return nil
        }

        var prepared: [PreparedContent] = []
        for (index, content) in entered.enumerated() {
            let number = index + 1
            guard let units = Int(content.unitsText.trimmed), units >= 1 else {
                errorMessage = "Product \(number): units must be a whole number"
                return nil
            }

            if let productId = content.productId {
                prepared.append(
                    PreparedContent(
                        productId: productId, units: units, name: "", category: "", bagCode: nil
                    )
                )
                continue
            }

            let name = content.name.trimmed
            let category = content.category.trimmed
            guard !name.isEmpty, !category.isEmpty else {
                errorMessage = "Product \(number): name and category are required"
                return nil
            }

            // A bag code is a DIFFERENT code from the case code just scanned.
            var bagCode: String?
            let typedBagCode = content.bagCode.trimmed
            if !typedBagCode.isEmpty {
                guard let normalized = Gtin.normalize(typedBagCode) else {
                    errorMessage = "Product \(number): \"\(typedBagCode)\" isn't a valid barcode"
                    return nil
                }
                bagCode = normalized.gtin14
            }

            prepared.append(
                PreparedContent(
                    productId: nil, units: units, name: name,
                    category: category, bagCode: bagCode
                )
            )
        }
        return prepared
    }

    // MARK: - The mirror

    private func storedProducts(in context: ModelContext) -> [StoredProduct] {
        (try? context.fetch(FetchDescriptor<StoredProduct>())) ?? []
    }

    private func storedPacks(in context: ModelContext) -> [StoredPack] {
        (try? context.fetch(FetchDescriptor<StoredPack>())) ?? []
    }

    private func productNames(in context: ModelContext) -> [String: String] {
        Dictionary(storedProducts(in: context).map { ($0.id, $0.name) }) { first, _ in first }
    }
}

private extension String {
    /// Text fields arrive with whatever the keyboard left behind.
    var trimmed: String { trimmingCharacters(in: .whitespacesAndNewlines) }
}
