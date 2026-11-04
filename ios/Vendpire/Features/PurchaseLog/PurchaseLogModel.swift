import Foundation
import SwiftData

/// The purchase screen's state and every mutation of it.
///
/// The phone never splits money: unit rows become `lines`, pack rows become
/// `packLines`, and the server's `expandPackLines` is the only thing that turns
/// a case into per-product cost. `Allocate` appears here once, in
/// `splitPreview`, and that number is never submitted.
@MainActor
@Observable
final class PurchaseLogModel {
    // MARK: - Entry state

    /// Supplied by `PurchaseSetupView` before this screen is reachable.
    var vendor: String = ""
    var purchasedDate: Date = Date()
    var notes: String = ""
    var receiptTotalText: String = ""

    private(set) var rows: [PurchaseRow] = []
    /// The receipt line on the Entry screen. Set means the sheet shows Entry;
    /// it becomes a row only on `commitPendingLine`.
    private(set) var pendingLine: LineEntry?
    /// Total or Each, carried from one entry to the next: one purchase is one
    /// store, and the store decides how its receipt prints.
    private(set) var costEntryMode: LineEntry.CostEntryMode = .total
    /// Only this screen's own complaints — a blank vendor, a half-typed line, a
    /// draft that wouldn't encode. Everything a scan can go wrong with belongs
    /// to `resolver`, and the sheet reads it there.
    private(set) var errorMessage: String?

    /// Minted when the screen opens, not at save time: double-tapping Save
    /// sends the SAME key twice, and the server returns the first purchase
    /// instead of writing a second one.
    let clientRequestId = UUID().uuidString

    /// True once a draft has reached the outbox. The first success is terminal
    /// for the screen.
    private(set) var isSaved = false

    /// Shared with the resolver, so a record created down inside a case is
    /// findable up here without a refresh. See `MirrorCatalog`.
    @ObservationIgnored
    private let catalog: MirrorCatalog

    /// Turning a scanned code into something this screen can list. Packs are a
    /// legal answer here — a case is a perfectly normal thing to buy.
    let resolver: BarcodeResolutionModel

    init() {
        // Locals first: `self` is off limits until every stored property is
        // initialized, and the resolver needs the catalog to share.
        let catalog = MirrorCatalog()
        let resolver = BarcodeResolutionModel(allowsPacks: true, catalog: catalog)
        self.catalog = catalog
        self.resolver = resolver

        resolver.onResolve = { [weak self] item in
            self?.beginLine(for: item)
        }
    }

    // MARK: - What the screen reads

    /// Unparseable rows count as zero so the running total keeps up with
    /// typing instead of blanking out mid-keystroke. `save` is where a
    /// half-typed cost is actually refused.
    var enteredCents: Int {
        rows.reduce(0) { total, row in total + (Money.parseDollarsToCents(row.totalCostText) ?? 0) }
    }

    /// Nil while blank or unparseable — blank is not $0.00.
    var receiptTotalCents: Int? {
        guard !receiptTotalText.trimmed.isEmpty else { return nil }
        return Money.parseDollarsToCents(receiptTotalText)
    }

    /// How the entered lines compare to the receipt. Nil without a receipt
    /// total — there is nothing to reconcile against yet.
    var receiptStatus: ReceiptStatus? {
        guard let receiptTotalCents else { return nil }

        let differenceCents = enteredCents - receiptTotalCents
        if differenceCents > 0 { return .overReceipt(cents: differenceCents) }
        if differenceCents < 0 { return .unaccounted(cents: -differenceCents) }
        return .matches
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
        guard let (quantity, totalCostCents) = completeLine(row),
              let contents = caseContents(for: row, context: context)
        else { return nil }

        let weights = contents.map { $0.unitsPerCase * quantity }
        let shares = Allocate.proportionally(totalCents: totalCostCents, weights: weights)
        return contents.enumerated().map { index, content in
            (name: content.name, units: weights[index], cents: shares[index])
        }
    }

    /// Top to bottom, the way the screen reads: each row's quantity then cost.
    var fieldOrder: [PurchaseField] {
        rows.flatMap { [PurchaseField.quantity(rowId: $0.id), .totalCost(rowId: $0.id)] }
    }

    func field(after field: PurchaseField) -> PurchaseField? {
        neighbor(of: field, offset: 1)
    }

    func field(before field: PurchaseField) -> PurchaseField? {
        neighbor(of: field, offset: -1)
    }

    private func neighbor(of field: PurchaseField, offset: Int) -> PurchaseField? {
        let order = fieldOrder
        guard let index = order.firstIndex(of: field), order.indices.contains(index + offset)
        else { return nil }

        return order[index + offset]
    }

    /// What a case row's badge line and hint say. Nil for loose items and
    /// packs the mirror doesn't have.
    func caseSummary(for row: PurchaseRow, context: ModelContext) -> CaseSummary? {
        guard let pack = pack(for: row, context: context) else { return nil }

        let unitsPerCase = pack.unitsPerCase
        return CaseSummary(
            unitsPerCase: unitsPerCase,
            unitCostCents: unitCostCents(for: row, unitsPerCase: unitsPerCase, productCount: pack.contents.count)
        )
    }

    /// What one of this row's cases holds, by product name. Nil for loose
    /// items and packs the mirror doesn't have.
    func caseContents(for row: PurchaseRow, context: ModelContext) -> [CaseContent]? {
        guard let pack = pack(for: row, context: context) else { return nil }

        let names = catalog.productNames(in: context)
        return pack.contents.map { content in
            CaseContent(
                name: names[content.productId] ?? ProductNames.unknown,
                unitsPerCase: content.units
            )
        }
    }

    /// Only for a single-product case: an average across a mixed case describes
    /// none of its products.
    private func unitCostCents(for row: PurchaseRow, unitsPerCase: Int, productCount: Int) -> Int? {
        guard productCount == 1, unitsPerCase > 0,
              let (quantity, totalCostCents) = completeLine(row)
        else { return nil }

        return Int((Double(totalCostCents) / Double(quantity * unitsPerCase)).rounded())
    }

    /// The mirror's record for a case row. Nil for loose items and packs the
    /// mirror doesn't have.
    private func pack(for row: PurchaseRow, context: ModelContext) -> StoredPack? {
        guard row.kind == .pack else { return nil }
        return catalog.packs(in: context).first { $0.id == row.recordId }
    }

    /// A row's quantity and cost once both are typed in full — what the live
    /// hints wait for, so a half-typed value never flashes a wrong number.
    private func completeLine(_ row: PurchaseRow) -> (quantity: Int, totalCostCents: Int)? {
        guard let quantity = Int(row.quantityText.trimmed), quantity >= 1,
              let totalCostCents = Money.parseDollarsToCents(row.totalCostText)
        else { return nil }

        return (quantity, totalCostCents)
    }

    /// What one of a row's items cost, for the hint under its total. Nil at
    /// qty 1, where it would only repeat the total.
    func eachCents(for row: PurchaseRow) -> Int? {
        guard let (quantity, totalCostCents) = completeLine(row), quantity > 1 else { return nil }
        return Int((Double(totalCostCents) / Double(quantity)).rounded())
    }

    /// The first row already holding this record — the Entry screen's
    /// "already on this purchase" note.
    func existingLine(for item: CatalogItem) -> PurchaseRow? {
        rows.first { $0.isPack == item.isPack && $0.recordId == item.recordId }
    }

    func searchResults(query: String, context: ModelContext) -> [CatalogItem] {
        CatalogSearch.search(catalog.items(in: context), query: query)
    }

    // MARK: - Wiring

    /// Injected once from the view, which owns the client, and forwarded to the
    /// resolver. Everything the model does offline works without it.
    func configure(api: any VendpireAPI) {
        resolver.configure(api: api)
    }

    // MARK: - Adding lines

    /// Hand a scanned or typed code to the resolver. Whatever it turns out to
    /// be comes back through `onResolve`, wired in `init`.
    func handleScan(_ code: String, context: ModelContext) {
        clearError()
        resolver.resolve(code, context: context)
    }

    /// A result picked by name, onto the Entry screen like a scan.
    func add(_ item: CatalogItem) {
        // Picking by name answers the same question a parked scan was asking.
        resolver.dismissPendingScan()
        beginLine(for: item)
    }

    /// Every resolved item lands here, never straight on the list. A repeat is
    /// a new line, not a bump: the operator reads the receipt line by line, and
    /// one receipt can list the same item twice at two prices.
    private func beginLine(for item: CatalogItem) {
        clearError()
        pendingLine = LineEntry(item: item, mode: costEntryMode)
    }

    /// Patch form, like `updateRow`. A mode change sticks for the next entry.
    func updatePendingLine(
        quantityText: String? = nil,
        amountText: String? = nil,
        mode: LineEntry.CostEntryMode? = nil
    ) {
        guard pendingLine != nil else { return }

        if let quantityText { pendingLine?.quantityText = quantityText }
        if let amountText { pendingLine?.amountText = amountText }
        if let mode {
            pendingLine?.mode = mode
            costEntryMode = mode
        }
    }

    /// Append the Entry screen's line. False, changing nothing, while it is
    /// incomplete — the Add button is disabled then, so this is the backstop.
    @discardableResult
    func commitPendingLine() -> Bool {
        guard let line = pendingLine, line.isComplete else { return false }

        rows.append(line.makeRow())
        pendingLine = nil
        return true
    }

    /// The sheet closed without Add, from any depth.
    func cancelPendingLine() {
        pendingLine = nil
        resolver.dismissPendingScan()
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

    // MARK: - Saving

    /// Validate every row, build the submission, and enqueue it. Returns true
    /// only when a draft actually reached the outbox — the view dismisses on
    /// that.
    func save(context: ModelContext) -> Bool {
        guard !isSaved else { return false }

        clearError()

        let vendorName = vendor.trimmed
        guard !vendorName.isEmpty else {
            errorMessage = "Vendor is required"
            return false
        }

        guard let (lines, packLines) = validateRows() else { return false }

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
            receiptTotalCents: receiptTotalCents,
            notes: trimmedNotes.isEmpty ? nil : trimmedNotes,
            clientRequestId: clientRequestId
        )

        do {
            let item = try OutboxItem(purchase: submission)
            context.insert(item)
            try context.save()
        } catch {
            // Local failures only — the draft wouldn't encode, or the context
            // wouldn't save. Server sentences belong to the resolver.
            errorMessage = error.localizedDescription
            return false
        }

        isSaved = true
        return true
    }

    /// Every row validated and classified, or nil with `errorMessage` naming
    /// the first bad line. Unit rows keep `packId` nil — provenance is a
    /// server-side fact about an expanded pack line — and pack rows stay
    /// unexpanded, on purpose: `expandPackLines` is the server's.
    private func validateRows() -> (
        lines: [PurchaseSubmissionLine], packLines: [PurchaseSubmissionPackLine]
    )? {
        var lines: [PurchaseSubmissionLine] = []
        var packLines: [PurchaseSubmissionPackLine] = []
        for (index, row) in rows.enumerated() {
            let number = index + 1
            guard let totalCostCents = Money.parseDollarsToCents(row.totalCostText) else {
                errorMessage = "Line \(number): cost must be a dollar amount"
                return nil
            }
            guard let quantity = Int(row.quantityText.trimmed), quantity >= 1 else {
                let noun = row.kind == .pack ? "cases" : "units"
                errorMessage = "Line \(number): \(noun) must be a whole number"
                return nil
            }

            switch row.kind {
            case .unit:
                lines.append(
                    PurchaseSubmissionLine(
                        productId: row.recordId, units: quantity,
                        totalCostCents: totalCostCents, packId: nil
                    )
                )
            case .pack:
                packLines.append(
                    PurchaseSubmissionPackLine(
                        packId: row.recordId, qty: quantity, totalCostCents: totalCostCents
                    )
                )
            }
        }
        return (lines, packLines)
    }

    /// Midday rather than midnight: the picker yields a bare calendar day, and
    /// anchoring it at noon keeps the stored instant on that same day across
    /// every US timezone instead of slipping a day either side of UTC. The
    /// web's `T12:00:00` suffix is the same trick.
    private var middayOnPurchasedDate: Date {
        Calendar.current.date(bySettingHour: 12, minute: 0, second: 0, of: purchasedDate)
            ?? purchasedDate
    }

    // MARK: - Errors

    private func clearError() {
        errorMessage = nil
    }

    // MARK: - The mirror

    func invalidateCatalog() {
        catalog.invalidate()
    }
}
