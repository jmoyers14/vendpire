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
    /// One entry per `.packDraft` row, keyed by its `recordId` — the
    /// resolver `commitPendingCase` detached, still collecting that case's
    /// contents. Removed once `createPack` succeeds and the row becomes a
    /// real `.pack`, or if the row itself is deleted.
    private(set) var packDrafts: [String: BarcodeResolutionModel] = [:]
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
            self?.addOrIncrementRow(
                kind: item.isPack ? .pack : .unit,
                recordId: item.recordId,
                name: item.name
            )
        }
        resolver.onCommitPackDraft = { [weak self] draft in
            self?.commitPackDraft(draft)
        }
    }

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
              let pack = catalog.packs(in: context).first(where: { $0.id == row.recordId })
        else { return nil }

        let weights = pack.contents.map { $0.units * quantity }
        let shares = Allocate.proportionally(totalCents: totalCostCents, weights: weights)
        let names = catalog.productNames(in: context)
        return pack.contents.enumerated().map { index, content in
            (
                name: names[content.productId] ?? ProductNames.unknown,
                units: content.units * quantity,
                cents: shares[index]
            )
        }
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

    /// A result picked by name. Always a new row rather than an increment: the
    /// same product can legitimately appear twice on one receipt at two
    /// prices, and searching for it again is the only way to say so.
    func add(_ item: CatalogItem) {
        clearError()
        // Picking by name answers the same question a parked scan was asking.
        resolver.dismissPendingScan()
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
        if let row = rows.first(where: { $0.id == id }), row.kind == .packDraft {
            // Takes the in-flight candidate lookup with it.
            packDrafts[row.recordId]?.dismissPendingScan()
            packDrafts[row.recordId] = nil
        }
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
            guard row.kind != .packDraft else {
                errorMessage = "Line \(number): this case still needs its contents — tap it to finish"
                return nil
            }
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
            case .packDraft:
                preconditionFailure("the guard above returns before a draft row reaches this switch")
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

    // MARK: - Rows

    /// A second scan of the same thing means two of it, not a second line to
    /// reconcile against one receipt entry.
    private func addOrIncrementRow(kind: PurchaseRow.Kind, recordId: String, name: String) {
        guard let index = rows.firstIndex(where: { $0.kind == kind && $0.recordId == recordId })
        else {
            let row = PurchaseRow(kind: kind, recordId: recordId, name: name)
            rows.append(row)
            scanConfirmation = ScanConfirmation(
                rowId: row.id, name: name, isPack: row.isPack, quantity: 1, effect: .added
            )
            return
        }

        let quantity = (Int(rows[index].quantityText.trimmed) ?? 0) + 1
        rows[index].quantityText = String(quantity)
        scanConfirmation = ScanConfirmation(
            rowId: rows[index].id, name: name, isPack: rows[index].isPack,
            quantity: quantity, effect: .incremented
        )
    }

    // MARK: - Telling the operator it worked

    /// What the last scan did, for the card over the camera. Replaced by the
    /// next scan rather than timed out — a flash can be missed while looking
    /// at the cart.
    private(set) var scanConfirmation: ScanConfirmation?

    /// Reverse the last scan. An increment steps back down instead of
    /// removing the row, because undoing an accidental double-scan must not
    /// discard the first one.
    func undoLastScan() {
        guard let confirmation = scanConfirmation else { return }
        scanConfirmation = nil

        switch confirmation.effect {
        case .added, .caseStarted:
            // Through `removeRow` so a draft case also gives up its resolver.
            removeRow(id: confirmation.rowId)
        case .incremented:
            guard let index = rows.firstIndex(where: { $0.id == confirmation.rowId }) else { return }
            rows[index].quantityText = String(max(confirmation.quantity - 1, 1))
        }
    }

    /// The scanner closed, so there is nothing left to confirm.
    func clearScanConfirmation() {
        scanConfirmation = nil
    }

    /// "It's a case of items": a flagged row appears now, holding onto the
    /// detached resolver until its contents are done. Wiring `onResolve`
    /// here, rather than in `BarcodeResolutionModel`, is what lets the same
    /// resolver type serve both the shared scan-everything resolver and a
    /// one-off draft without knowing which it is.
    private func commitPackDraft(_ draft: BarcodeResolutionModel) {
        let draftId = UUID().uuidString
        draft.onResolve = { [weak self] item in
            self?.resolveDraft(draftId, into: item)
        }
        packDrafts[draftId] = draft

        // The outside guess when one landed: "Frito-Lay 30ct variety" tells the
        // operator which box they just committed to, where "New case" doesn't.
        let candidateName = draft.pendingScan?.candidate?.displayName ?? ""
        let name = candidateName.trimmed.isEmpty ? "New case" : candidateName
        let row = PurchaseRow(kind: .packDraft, recordId: draftId, name: name)
        rows.append(row)
        // Committing a case drops the sheet straight back to the camera, which
        // on its own looks like the tap did nothing.
        scanConfirmation = ScanConfirmation(
            rowId: row.id, name: name, isPack: true, quantity: 1, effect: .caseStarted
        )
    }

    /// `createPack` succeeded: the draft becomes a real row, keeping
    /// whatever quantity or cost the operator already typed in rather than
    /// starting the line over.
    private func resolveDraft(_ draftId: String, into item: CatalogItem) {
        packDrafts[draftId] = nil
        guard let index = rows.firstIndex(where: { $0.kind == .packDraft && $0.recordId == draftId })
        else { return }

        rows[index] = PurchaseRow(
            id: rows[index].id,
            kind: .pack,
            recordId: item.recordId,
            name: item.name,
            quantityText: rows[index].quantityText,
            totalCostText: rows[index].totalCostText
        )
    }

    // MARK: - The mirror

    func invalidateCatalog() {
        catalog.invalidate()
    }
}
