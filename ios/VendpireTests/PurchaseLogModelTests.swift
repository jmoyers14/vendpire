import SwiftData
import XCTest

@testable import Vendpire

/// What the stub was asked for. A box rather than captured `var`s: the stub's
/// hooks are `@Sendable`, so a mutable capture would not compile.
private final class CallLog: @unchecked Sendable {
    var productDrafts: [RemoteProductDraft] = []
    var packDrafts: [RemotePackDraft] = []
    var attachedProducts: [(productId: String, code: String)] = []
}

/// Nonisolated so the stub's `@Sendable` hooks can build them.
private enum Remote {
    static func product(id: String, name: String, upc: String?) -> RemoteProduct {
        RemoteProduct(
            id: id, name: name, upc: upc, category: "drinks", taxClass: nil,
            imageUrl: nil, defaultPriceCents: 175, active: true,
            deletedAt: nil, updatedAt: nil
        )
    }

    static func pack(id: String, name: String, contents: [PackContent]) -> RemotePack {
        RemotePack(
            id: id, name: name, barcodes: ["10049000042556"], contents: contents,
            active: true, deletedAt: nil, updatedAt: nil
        )
    }
}

/// The purchase screen's brain: what a scan turns into, what the receipt
/// reconciliation says, what a half-typed line costs you, and what actually
/// reaches the outbox.
///
/// The load-bearing rule the save tests pin down is that the phone NEVER
/// splits money — unit rows become `lines`, pack rows become `packLines`, and
/// the server expands. `Allocate` appears here only as a display preview.
@MainActor
final class PurchaseLogModelTests: XCTestCase {
    private var context: ModelContext!
    private var model: PurchaseLogModel!
    private var api: StubVendpireAPI!

    /// A real UPC-A; `Gtin.normalize` pads it to "00049000042559".
    private let cokeUpc = "049000042559"
    /// A native GTIN-14 with indicator 1 — `likelyCase` is true for it.
    private let caseCode = "10049000042556"
    /// A second valid code, for a bag that carries its own.
    private let bagCode = "012345678905"

    private func makeScreen(
        products: [StoredProduct] = [],
        packs: [StoredPack] = []
    ) throws {
        context = ModelContext(try VendpireStore.makeInMemoryContainer())
        for product in products { context.insert(product) }
        for pack in packs { context.insert(pack) }
        try context.save()

        api = StubVendpireAPI()
        model = PurchaseLogModel()
        model.configure(api: api)
        // What `PurchaseSetupView` settles before this screen is reachable.
        // Tests that are about the blank-vendor refusal clear it themselves.
        model.vendor = "Costco"
    }

    // MARK: - Seeds

    private func makeCoke() -> StoredProduct {
        StoredProduct(
            id: "p-coke", name: "Coke Zero", upc: "00049000042559",
            category: "drinks", defaultPriceCents: 175
        )
    }

    private func makeDoritos() -> StoredProduct {
        StoredProduct(
            id: "p-doritos", name: "Doritos Nacho Cheese",
            category: "snacks", defaultPriceCents: 150
        )
    }

    /// 20 Cokes and 10 bags of Doritos — the weights the split preview uses.
    private func makeVarietyCase() -> StoredPack {
        StoredPack(
            id: "k-variety", name: "Costco variety case",
            barcodes: ["10049000042556"],
            contents: [
                PackContent(productId: "p-coke", units: 20),
                PackContent(productId: "p-doritos", units: 10),
            ]
        )
    }

    /// Put a product into the case being created, the way the Search door
    /// does — no network, no inner resolver.
    private func addContent(productId: String, name: String, units: String) {
        model.resolver.addContent(
            CatalogItem(
                kind: .unit(imageUrl: nil), recordId: productId, name: name, barcode: nil
            )
        )
        guard let added = model.resolver.contents.last else {
            return XCTFail("addContent did not append a row")
        }
        model.resolver.updateContent(id: added.id, unitsText: units)
    }

    private func fetchOutbox() throws -> [OutboxItem] {
        try context.fetch(FetchDescriptor<OutboxItem>())
    }

    private func fetchStoredProducts() throws -> [StoredProduct] {
        try context.fetch(FetchDescriptor<StoredProduct>())
    }

    private func decodeSubmission(_ item: OutboxItem) throws -> PurchaseSubmission {
        try PurchaseSubmission.makeDecoder().decode(PurchaseSubmission.self, from: item.payload)
    }

    // MARK: - Scanning

    func testKnownScanAddsARow() throws {
        try makeScreen(products: [makeCoke()])

        model.handleScan(cokeUpc, context: context)

        XCTAssertEqual(model.rows.count, 1)
        let row = try XCTUnwrap(model.rows.first)
        XCTAssertEqual(row.kind, .unit)
        XCTAssertEqual(row.recordId, "p-coke")
        XCTAssertEqual(row.name, "Coke Zero", "the row denormalizes the name for display")
        XCTAssertEqual(row.quantityText, "1")
        XCTAssertEqual(row.totalCostText, "")
        XCTAssertNil(model.resolver.pendingScan)
        XCTAssertNil(model.resolver.errorMessage)
    }

    /// Scanning the same can twice means two cans, not two lines to reconcile.
    func testRescanIncrementsInsteadOfDuplicating() throws {
        try makeScreen(products: [makeCoke()])

        model.handleScan(cokeUpc, context: context)
        model.handleScan(cokeUpc, context: context)

        XCTAssertEqual(model.rows.count, 1)
        XCTAssertEqual(model.rows.first?.quantityText, "2")
    }

    func testPackScanAddsAPackRowWithQty1() throws {
        try makeScreen(products: [makeCoke(), makeDoritos()], packs: [makeVarietyCase()])

        model.handleScan(caseCode, context: context)

        let row = try XCTUnwrap(model.rows.first)
        XCTAssertEqual(row.kind, .pack)
        XCTAssertEqual(row.recordId, "k-variety")
        XCTAssertEqual(row.name, "Costco variety case")
        XCTAssertEqual(row.quantityText, "1", "a scanned case is one case until told otherwise")
    }

    func testUnknownScanParksAPendingScan() async throws {
        try makeScreen(products: [makeCoke()])

        model.handleScan(caseCode, context: context)
        await model.resolver.candidateFetch?.value

        let pending = try XCTUnwrap(model.resolver.pendingScan)
        XCTAssertEqual(pending.gtin14, "10049000042556")
        XCTAssertTrue(pending.likelyCase)
        XCTAssertTrue(model.rows.isEmpty, "an unknown code adds nothing until the sheet resolves it")
        XCTAssertNil(model.resolver.errorMessage, "not-found is a question, not an error")
    }

    /// The candidate is a guess from an outside database. A lookup that fails
    /// must leave the sheet usable, not block entry.
    func testACandidateLookupFailureNeverBlocksEntry() async throws {
        try makeScreen()
        api.onFetchBarcodeCandidate = { _ in throw StubError.unreachable }

        model.handleScan(caseCode, context: context)
        await model.resolver.candidateFetch?.value

        XCTAssertNotNil(model.resolver.pendingScan)
        XCTAssertNil(model.resolver.pendingScan?.candidate)
        XCTAssertNil(model.resolver.errorMessage)
    }

    func testACandidateLookupFillsTheSheet() async throws {
        try makeScreen()
        api.onFetchBarcodeCandidate = { _ in
            RemoteCandidate(name: "Coca-Cola Zero", brand: "Coca-Cola", imageUrl: "https://x/i.png")
        }

        model.handleScan(caseCode, context: context)
        await model.resolver.candidateFetch?.value

        XCTAssertEqual(model.resolver.pendingScan?.candidate?.name, "Coca-Cola Zero")
    }

    func testInvalidScanSetsAnErrorAndNothingElse() throws {
        try makeScreen(products: [makeCoke()])

        model.handleScan("12345", context: context)

        let message = try XCTUnwrap(model.resolver.errorMessage)
        XCTAssertTrue(message.contains("12345"), "the operator needs to see which digits failed")
        XCTAssertTrue(model.rows.isEmpty)
        XCTAssertNil(model.resolver.pendingScan)
    }

    // MARK: - Reconciliation

    func testReceiptStatusReadsOverUnderAndMatching() throws {
        try makeScreen(products: [makeCoke()])
        model.handleScan(cokeUpc, context: context)
        let row = try XCTUnwrap(model.rows.first)
        model.updateRow(id: row.id, totalCostText: "12.99")

        XCTAssertEqual(model.enteredCents, 1299)
        XCTAssertNil(model.receiptStatus, "no receipt total means nothing to reconcile against")

        model.receiptTotalText = "10.00"
        XCTAssertEqual(model.receiptStatus, .overReceipt(cents: 299))

        model.receiptTotalText = "15.00"
        XCTAssertEqual(model.receiptStatus, .unaccounted(cents: 201))

        model.receiptTotalText = "12.99"
        XCTAssertEqual(model.receiptStatus, .matches)
    }

    func testReceiptTotalIsNilUntilItParses() throws {
        try makeScreen()

        XCTAssertNil(model.receiptTotalCents)
        model.receiptTotalText = "  "
        XCTAssertNil(model.receiptTotalCents, "blank is not $0.00")
        model.receiptTotalText = "41.20"
        XCTAssertEqual(model.receiptTotalCents, 4120)
    }

    // MARK: - Saving

    /// `PurchaseSetupView` makes this unreachable — it will not push the
    /// purchase screen without a vendor — but the guard behind it is the
    /// backstop, and a backstop has to name the problem rather than fail quiet.
    func testSaveRefusesABlankVendor() throws {
        try makeScreen(products: [makeCoke()])
        model.handleScan(cokeUpc, context: context)
        let row = try XCTUnwrap(model.rows.first)
        model.updateRow(id: row.id, totalCostText: "1.99")
        model.vendor = "   "

        XCTAssertFalse(model.save(context: context))

        XCTAssertNotNil(model.errorMessage)
        XCTAssertEqual(try fetchOutbox().count, 0, "a rejected draft must not reach the outbox")
    }

    func testSaveRejectsAHalfTypedRow() throws {
        try makeScreen(products: [makeCoke(), makeDoritos()])
        model.handleScan(cokeUpc, context: context)
        let doritos = try XCTUnwrap(model.searchResults(query: "doritos", context: context).first)
        model.add(doritos)
        let first = try XCTUnwrap(model.rows.first)
        model.updateRow(id: first.id, totalCostText: "12.99")

        XCTAssertFalse(model.save(context: context))

        let message = try XCTUnwrap(model.errorMessage)
        XCTAssertTrue(message.contains("Line 2"), "the error names the line, got: \(message)")
        XCTAssertEqual(try fetchOutbox().count, 0, "a rejected draft must not reach the outbox")
    }

    func testSaveEnqueuesOnePurchaseOutboxItem() throws {
        try makeScreen(products: [makeCoke(), makeDoritos()], packs: [makeVarietyCase()])
        model.handleScan(cokeUpc, context: context)
        model.handleScan(cokeUpc, context: context)
        model.handleScan(caseCode, context: context)

        let unitRow = try XCTUnwrap(model.rows.first { $0.kind == .unit })
        let packRow = try XCTUnwrap(model.rows.first { $0.kind == .pack })
        model.updateRow(id: unitRow.id, totalCostText: "12.99")
        model.updateRow(id: packRow.id, totalCostText: "27.01")
        model.receiptTotalText = "40.00"
        model.notes = "Costco run"
        // Mid-afternoon local: the midday anchor has to land on this same day,
        // not skip forward to tomorrow's noon.
        model.purchasedDate = Date(timeIntervalSince1970: 1_700_000_000)

        XCTAssertTrue(model.save(context: context))

        let items = try fetchOutbox()
        XCTAssertEqual(items.count, 1)
        let item = try XCTUnwrap(items.first)
        XCTAssertEqual(item.kind, "purchase")
        XCTAssertEqual(item.status, "queued")
        XCTAssertEqual(item.id, model.clientRequestId)

        let submission = try decodeSubmission(item)
        XCTAssertEqual(submission.vendor, "Costco")
        XCTAssertEqual(submission.notes, "Costco run")
        XCTAssertEqual(submission.receiptTotalCents, 4000)
        XCTAssertEqual(submission.clientRequestId, model.clientRequestId)

        XCTAssertEqual(submission.lines.count, 1, "unit rows go to lines")
        XCTAssertEqual(submission.lines.first?.productId, "p-coke")
        XCTAssertEqual(submission.lines.first?.units, 2)
        XCTAssertEqual(submission.lines.first?.totalCostCents, 1299)
        XCTAssertNil(submission.lines.first?.packId, "the phone never attributes a unit line to a pack")

        XCTAssertEqual(submission.packLines.count, 1, "pack rows go to packLines, unexpanded")
        XCTAssertEqual(submission.packLines.first?.packId, "k-variety")
        XCTAssertEqual(submission.packLines.first?.qty, 1)
        XCTAssertEqual(submission.packLines.first?.totalCostCents, 2701)

        let anchored = Calendar.current.dateComponents(
            [.year, .month, .day, .hour, .minute, .second], from: submission.purchasedAt
        )
        let chosen = Calendar.current.dateComponents([.year, .month, .day], from: model.purchasedDate)
        XCTAssertEqual(anchored.hour, 12, "local midday keeps the day stable across timezones")
        XCTAssertEqual(anchored.minute, 0)
        XCTAssertEqual(anchored.second, 0)
        XCTAssertEqual(anchored.year, chosen.year)
        XCTAssertEqual(anchored.month, chosen.month)
        XCTAssertEqual(anchored.day, chosen.day)
        XCTAssertEqual(item.countedAt, submission.purchasedAt, "the queue orders by when it was bought")
    }

    /// The key is minted when the screen opens, so a double-tap cannot post a
    /// second purchase. First success is terminal for the screen.
    func testSaveTwiceReusesTheClientRequestId() throws {
        try makeScreen(products: [makeCoke()])
        model.handleScan(cokeUpc, context: context)
        let row = try XCTUnwrap(model.rows.first)
        model.updateRow(id: row.id, totalCostText: "12.99")
        let mintedId = model.clientRequestId

        XCTAssertTrue(model.save(context: context))
        XCTAssertFalse(model.save(context: context), "a second success must be impossible")

        XCTAssertNil(model.errorMessage, "the screen is already dismissing — there is nothing to report")
        let items = try fetchOutbox()
        XCTAssertEqual(items.count, 1)
        XCTAssertEqual(items.first?.id, mintedId)
        XCTAssertEqual(model.clientRequestId, mintedId)
    }

    func testSaveRejectsAnEmptyDraft() throws {
        try makeScreen(products: [makeCoke()])

        XCTAssertFalse(model.save(context: context))

        XCTAssertNotNil(model.errorMessage)
        XCTAssertEqual(try fetchOutbox().count, 0)
    }

    // MARK: - Split preview

    func testSplitPreviewMatchesTheAllocator() throws {
        try makeScreen(products: [makeCoke(), makeDoritos()], packs: [makeVarietyCase()])
        model.handleScan(caseCode, context: context)
        let scanned = try XCTUnwrap(model.rows.first)
        model.updateRow(id: scanned.id, totalCostText: "37.98")
        let row = try XCTUnwrap(model.rows.first)

        let preview = try XCTUnwrap(model.splitPreview(for: row, context: context))

        XCTAssertEqual(
            preview.map(\.cents),
            Allocate.proportionally(totalCents: 3798, weights: [20, 10]),
            "the preview must be the same allocator the server runs"
        )
        XCTAssertEqual(preview.map(\.units), [20, 10])
        XCTAssertEqual(preview.map(\.name), ["Coke Zero", "Doritos Nacho Cheese"])
    }

    func testSplitPreviewStaysSilentWhileTheCostIsHalfTyped() throws {
        try makeScreen(products: [makeCoke(), makeDoritos()], packs: [makeVarietyCase()])
        model.handleScan(caseCode, context: context)
        let packRow = try XCTUnwrap(model.rows.first)

        XCTAssertNil(
            model.splitPreview(for: packRow, context: context),
            "a blank cost must not flash a wrong split"
        )

        model.handleScan(cokeUpc, context: context)
        let unitRow = try XCTUnwrap(model.rows.first { $0.kind == .unit })
        model.updateRow(id: unitRow.id, totalCostText: "12.99")
        let pricedUnitRow = try XCTUnwrap(model.rows.first { $0.kind == .unit })
        XCTAssertNil(
            model.splitPreview(for: pricedUnitRow, context: context),
            "a unit row has nothing to split"
        )
    }

    // MARK: - Field order

    func testFieldsRunDownEachRowThenTheReceipt() throws {
        try makeScreen(products: [makeCoke(), makeDoritos()])
        model.add(CatalogItem(kind: .unit(imageUrl: nil), recordId: "p-coke", name: "Coke Zero", barcode: nil))
        model.add(CatalogItem(kind: .unit(imageUrl: nil), recordId: "p-doritos", name: "Doritos", barcode: nil))
        let first = model.rows[0].id
        let second = model.rows[1].id

        XCTAssertEqual(model.fieldOrder, [
            .quantity(rowId: first), .totalCost(rowId: first),
            .quantity(rowId: second), .totalCost(rowId: second),
            .receiptTotal, .notes,
        ])
        XCTAssertEqual(model.field(after: .totalCost(rowId: first)), .quantity(rowId: second))
        XCTAssertEqual(model.field(before: .receiptTotal), .totalCost(rowId: second))
    }

    func testFieldOrderStopsAtBothEnds() throws {
        try makeScreen(products: [makeCoke()])
        model.handleScan(cokeUpc, context: context)
        let row = try XCTUnwrap(model.rows.first)

        XCTAssertNil(model.field(before: .quantity(rowId: row.id)))
        XCTAssertNil(model.field(after: .notes))
    }

    func testFieldOrderOfAnEmptyPurchaseIsJustTheReceipt() throws {
        try makeScreen()

        XCTAssertEqual(model.fieldOrder, [.receiptTotal, .notes])
        XCTAssertNil(
            model.field(after: .quantity(rowId: UUID())),
            "a deleted row's field has no neighbors"
        )
    }

    // MARK: - Case summary

    /// A whole case of one product — the only kind with a meaningful per-unit cost.
    private func makeCokeCase() -> StoredPack {
        StoredPack(
            id: "k-coke", name: "Coke Zero 35pk",
            barcodes: ["10012345678902"],
            contents: [PackContent(productId: "p-coke", units: 35)]
        )
    }

    private func addCase(_ pack: StoredPack, quantity: String = "1", cost: String) throws -> PurchaseRow {
        let units = pack.contents.reduce(0) { $0 + $1.units }
        model.add(CatalogItem(kind: .pack(units: units), recordId: pack.id, name: pack.name, barcode: nil))
        let added = try XCTUnwrap(model.rows.last)
        model.updateRow(id: added.id, quantityText: quantity, totalCostText: cost)
        return try XCTUnwrap(model.rows.last)
    }

    func testCaseSummaryPricesEachUnitOfASingleProductCase() throws {
        try makeScreen(products: [makeCoke()], packs: [makeCokeCase()])

        let one = try addCase(makeCokeCase(), cost: "18.99")
        let two = try addCase(makeCokeCase(), quantity: "2", cost: "37.98")

        XCTAssertEqual(
            model.caseSummary(for: one, context: context),
            CaseSummary(unitsPerCase: 35, unitCostCents: 54),
            "$18.99 over 35 units rounds to $0.54"
        )
        XCTAssertEqual(
            model.caseSummary(for: two, context: context)?.unitCostCents, 54,
            "two cases means 70 units, not 35"
        )
    }

    func testCaseSummaryCountsAMixedCaseButDoesNotPriceIt() throws {
        try makeScreen(products: [makeCoke(), makeDoritos()], packs: [makeVarietyCase()])

        let row = try addCase(makeVarietyCase(), cost: "37.98")

        XCTAssertEqual(
            model.caseSummary(for: row, context: context),
            CaseSummary(unitsPerCase: 30, unitCostCents: nil),
            "an average across Coke and Doritos would describe neither"
        )
    }

    func testCaseSummaryLeavesTheUnitCostBlankWhileHalfTyped() throws {
        try makeScreen(products: [makeCoke()], packs: [makeCokeCase()])

        let noCost = try addCase(makeCokeCase(), cost: "")
        let noQuantity = try addCase(makeCokeCase(), quantity: "", cost: "18.99")

        XCTAssertEqual(
            model.caseSummary(for: noCost, context: context),
            CaseSummary(unitsPerCase: 35, unitCostCents: nil)
        )
        XCTAssertNil(model.caseSummary(for: noQuantity, context: context)?.unitCostCents)
    }

    func testCaseSummaryIsNilForALooseItem() throws {
        try makeScreen(products: [makeCoke()])
        model.handleScan(cokeUpc, context: context)
        let row = try XCTUnwrap(model.rows.first)

        XCTAssertNil(model.caseSummary(for: row, context: context))
    }

    // MARK: - Attaching a code to something that already exists

    func testAttachAddsTheRowAndMirrorsTheRecord() async throws {
        try makeScreen(products: [makeCoke()])
        let calls = CallLog()
        api.onAttachProductBarcode = { productId, code in
            calls.attachedProducts.append((productId, code))
            return Remote.product(id: productId, name: "Coke Zero", upc: code)
        }

        model.handleScan(caseCode, context: context)
        await model.resolver.candidateFetch?.value
        let item = try XCTUnwrap(model.searchResults(query: "coke", context: context).first)
        await model.resolver.attach(to: item, context: context)

        XCTAssertEqual(calls.attachedProducts.map(\.productId), ["p-coke"])
        XCTAssertEqual(calls.attachedProducts.map(\.code), ["10049000042556"])
        XCTAssertNil(model.resolver.pendingScan, "a resolved scan closes the sheet")
        XCTAssertEqual(model.rows.count, 1)
        XCTAssertEqual(model.rows.first?.recordId, "p-coke")

        let stored = try fetchStoredProducts()
        XCTAssertEqual(stored.count, 1, "an attach upserts, it never reconciles the mirror")
        XCTAssertEqual(stored.first?.upc, "10049000042556", "the new code is in the mirror immediately")
    }

    func testAttachFailureKeepsTheSheetOpen() async throws {
        try makeScreen(products: [makeCoke()])
        api.onAttachProductBarcode = { _, _ in throw StubError.unreachable }

        model.handleScan(caseCode, context: context)
        await model.resolver.candidateFetch?.value
        let item = try XCTUnwrap(model.searchResults(query: "coke", context: context).first)
        await model.resolver.attach(to: item, context: context)

        XCTAssertNotNil(model.resolver.errorMessage)
        XCTAssertNotNil(model.resolver.pendingScan, "the sheet stays open so the operator can try again")
        XCTAssertTrue(model.rows.isEmpty)
    }

    /// The sheet's one-tap recovery is built on this sentence: it names the
    /// record the code is already on. A runtime enum dump in its place would
    /// strand the operator.
    func testAConflictingAttachShowsTheServersSentence() async throws {
        try makeScreen(products: [makeCoke()])
        let message = "Barcode 10049000042556 is the case code of pack \"Costco variety case\""
        api.onAttachProductBarcode = { _, _ in
            throw VendpireAPIError(statusCode: 409, message: message)
        }

        model.handleScan(caseCode, context: context)
        await model.resolver.candidateFetch?.value
        let item = try XCTUnwrap(model.searchResults(query: "coke", context: context).first)
        await model.resolver.attach(to: item, context: context)

        XCTAssertEqual(model.resolver.errorMessage, message)
        XCTAssertEqual(model.resolver.errorStatusCode, 409, "the sheet offers the one-tap on the status")
        XCTAssertNotNil(model.resolver.pendingScan, "the sheet stays open so the operator can attach instead")
    }

    /// A stale 409 would keep offering "use existing instead" against a
    /// message that is no longer about a conflict.
    func testTheNextActionClearsTheStatus() async throws {
        try makeScreen(products: [makeCoke()])
        api.onAttachProductBarcode = { _, _ in
            throw VendpireAPIError(statusCode: 409, message: "already on something")
        }

        model.handleScan(caseCode, context: context)
        await model.resolver.candidateFetch?.value
        let item = try XCTUnwrap(model.searchResults(query: "coke", context: context).first)
        await model.resolver.attach(to: item, context: context)
        await model.resolver.createUnit(name: "", category: "", priceText: "", context: context)

        XCTAssertEqual(model.resolver.errorMessage, "Name and category are required")
        XCTAssertNil(model.resolver.errorStatusCode)
    }

    // MARK: - Creating what the code names

    func testCreateUnitUsesTheCandidateImageAndAddsTheRow() async throws {
        try makeScreen()
        let calls = CallLog()
        api.onFetchBarcodeCandidate = { _ in
            RemoteCandidate(name: "Coca-Cola Zero", brand: "Coca-Cola", imageUrl: "https://x/i.png")
        }
        api.onCreateProduct = { draft in
            calls.productDrafts.append(draft)
            return Remote.product(id: "p-new", name: draft.name, upc: draft.upc)
        }

        model.handleScan(caseCode, context: context)
        await model.resolver.candidateFetch?.value
        await model.resolver.createUnit(
            name: "Coke Zero", category: "drinks", priceText: "1.75", context: context
        )

        let draft = try XCTUnwrap(calls.productDrafts.first)
        XCTAssertEqual(draft.name, "Coke Zero")
        XCTAssertEqual(draft.upc, "10049000042556", "the scanned code becomes the unit's upc")
        XCTAssertEqual(draft.category, "drinks")
        XCTAssertEqual(draft.imageUrl, "https://x/i.png")
        XCTAssertEqual(draft.defaultPriceCents, 175)

        XCTAssertNil(model.resolver.pendingScan)
        XCTAssertEqual(model.rows.first?.recordId, "p-new")
        XCTAssertEqual(try fetchStoredProducts().count, 1, "the new product is mirrored immediately")
    }

    func testCreateUnitRequiresANameAndCategory() async throws {
        try makeScreen()
        model.handleScan(caseCode, context: context)
        await model.resolver.candidateFetch?.value

        await model.resolver.createUnit(name: "  ", category: "drinks", priceText: "", context: context)

        XCTAssertNotNil(model.resolver.errorMessage)
        XCTAssertNotNil(model.resolver.pendingScan)
        XCTAssertTrue(model.rows.isEmpty)
    }

    /// A non-blank price that doesn't parse is a typo. Zeroing it silently
    /// would create a product priced at nothing and say so nowhere.
    func testCreateUnitRejectsAnUnparseablePrice() async throws {
        try makeScreen()
        let calls = CallLog()
        api.onCreateProduct = { draft in
            calls.productDrafts.append(draft)
            return Remote.product(id: "p-new", name: draft.name, upc: draft.upc)
        }

        model.handleScan(caseCode, context: context)
        await model.resolver.candidateFetch?.value
        await model.resolver.createUnit(
            name: "Coke Zero", category: "drinks", priceText: "$1.75", context: context
        )

        XCTAssertEqual(
            model.resolver.errorMessage,
            "Sell price must be a dollar amount (e.g. 1.75), or left blank"
        )
        XCTAssertTrue(calls.productDrafts.isEmpty, "nothing is created on a rejected price")
        XCTAssertNotNil(model.resolver.pendingScan, "the sheet stays open to fix the field")
        XCTAssertTrue(model.rows.isEmpty)
    }

    /// Blank still means "decide later" — the planogram slot is where the real
    /// number is set.
    func testCreateUnitTreatsABlankPriceAsDecideLater() async throws {
        try makeScreen()
        let calls = CallLog()
        api.onCreateProduct = { draft in
            calls.productDrafts.append(draft)
            return Remote.product(id: "p-new", name: draft.name, upc: draft.upc)
        }

        model.handleScan(caseCode, context: context)
        await model.resolver.candidateFetch?.value
        await model.resolver.createUnit(
            name: "Coke Zero", category: "drinks", priceText: "  ", context: context
        )

        XCTAssertNil(model.resolver.errorMessage)
        XCTAssertEqual(calls.productDrafts.first?.defaultPriceCents, 0)
        XCTAssertEqual(model.rows.first?.recordId, "p-new")
    }

    /// A button that does nothing reads as a missed tap. Without
    /// `configure(api:)` the three network actions can do nothing, so they say
    /// so rather than returning in silence.
    func testANetworkActionWithoutAnApiSaysSo() async throws {
        try makeScreen()
        let unconnected = PurchaseLogModel()
        unconnected.handleScan(caseCode, context: context)
        XCTAssertNotNil(unconnected.resolver.pendingScan)

        await unconnected.resolver.createUnit(
            name: "Coke Zero", category: "drinks", priceText: "", context: context
        )

        XCTAssertEqual(
            unconnected.resolver.errorMessage,
            "Not connected yet — close and reopen the screen"
        )
        XCTAssertTrue(unconnected.rows.isEmpty)
        XCTAssertNotNil(unconnected.resolver.pendingScan)
    }

    func testCreatePackOnlyCreatesThePack() async throws {
        try makeScreen(products: [makeCoke(), makeDoritos()])
        let calls = CallLog()
        api.onCreateProduct = { draft in
            calls.productDrafts.append(draft)
            return Remote.product(id: "p-new", name: draft.name, upc: draft.upc)
        }
        api.onCreatePack = { draft in
            calls.packDrafts.append(draft)
            return Remote.pack(id: "k-new", name: draft.name, contents: draft.contents)
        }

        model.handleScan(caseCode, context: context)
        await model.resolver.candidateFetch?.value
        addContent(productId: "p-coke", name: "Coke Zero", units: "20")
        addContent(productId: "p-doritos", name: "Doritos Nacho Cheese", units: "10")

        await model.resolver.createPack(name: "Costco variety case", context: context)

        XCTAssertTrue(
            calls.productDrafts.isEmpty,
            "every row already holds a real product — createPack creates only the pack"
        )

        let draft = try XCTUnwrap(calls.packDrafts.first)
        XCTAssertEqual(draft.name, "Costco variety case")
        XCTAssertEqual(draft.barcodes, ["10049000042556"], "the scanned code belongs to the case")
        XCTAssertEqual(
            draft.contents,
            [PackContent(productId: "p-coke", units: 20), PackContent(productId: "p-doritos", units: 10)]
        )
        XCTAssertNil(model.resolver.pendingScan)
        XCTAssertEqual(model.rows.first?.kind, .pack)
        XCTAssertEqual(model.rows.first?.recordId, "k-new")
    }

    /// A failure partway leaves the product behind — it is a record the
    /// operator wanted anyway, and a rerun picks it out of the mirror rather
    /// than duplicating it. The creation just happens earlier now, when the
    /// row was resolved rather than when the pack was saved.
    func testAProductCreatedForTheCaseStaysWhenThePackFails() async throws {
        try makeScreen()
        api.onCreateProduct = { draft in
            Remote.product(id: "p-new", name: draft.name, upc: draft.upc)
        }
        api.onCreatePack = { _ in throw StubError.unreachable }

        model.handleScan(caseCode, context: context)
        await model.resolver.candidateFetch?.value

        model.resolver.beginContentResolution(through: .blankCreate)
        let inner = try XCTUnwrap(model.resolver.contentResolver)
        await inner.createUnit(
            name: "Doritos Nacho Cheese", category: "snacks", priceText: "", context: context
        )

        XCTAssertEqual(model.resolver.contents.map(\.productId), ["p-new"])
        let row = try XCTUnwrap(model.resolver.contents.first)
        model.resolver.updateContent(id: row.id, unitsText: "10")

        await model.resolver.createPack(name: "Costco variety case", context: context)

        XCTAssertNotNil(model.resolver.errorMessage)
        XCTAssertNotNil(model.resolver.pendingScan, "the sheet stays open to retry")
        XCTAssertEqual(
            try fetchStoredProducts().map(\.id), ["p-new"],
            "the product that was created stays created"
        )
    }

    /// The number has to name the row on screen.
    func testCreatePackNumbersTheRowTheOperatorSees() async throws {
        try makeScreen(products: [makeCoke(), makeDoritos()])

        model.handleScan(caseCode, context: context)
        await model.resolver.candidateFetch?.value
        addContent(productId: "p-coke", name: "Coke Zero", units: "20")
        addContent(productId: "p-doritos", name: "Doritos Nacho Cheese", units: "oops")

        await model.resolver.createPack(name: "Costco variety case", context: context)

        let message = try XCTUnwrap(model.resolver.errorMessage)
        XCTAssertTrue(
            message.contains("Product 2"),
            "the number must name the visible row, got: \(message)"
        )
    }

    func testCreatePackRefusesACaseWithNothingInIt() async throws {
        try makeScreen()

        model.handleScan(caseCode, context: context)
        await model.resolver.candidateFetch?.value
        await model.resolver.createPack(name: "Costco variety case", context: context)

        XCTAssertEqual(model.resolver.errorMessage, "Add at least one product to the case")
    }

    // MARK: - One level down: a product inside the case

    func testAnInnerScanOfAKnownProductBecomesAContentRow() async throws {
        try makeScreen(products: [makeCoke()])

        model.handleScan(caseCode, context: context)
        await model.resolver.candidateFetch?.value
        model.resolver.beginContentResolution(through: .scanner)
        let inner = try XCTUnwrap(model.resolver.contentResolver)

        inner.resolve(cokeUpc, context: context)

        XCTAssertEqual(model.resolver.contents.map(\.productId), ["p-coke"])
        XCTAssertEqual(model.resolver.contents.first?.name, "Coke Zero")
        XCTAssertNil(model.resolver.contentResolver, "the inner flow closes once it has an answer")
        XCTAssertTrue(model.rows.isEmpty, "an inner scan fills a content row, never a purchase row")
    }

    /// A case cannot contain a case, and the likeliest cause is the operator
    /// scanning the outer box a second time.
    func testAnInnerScanRefusesACaseCode() async throws {
        try makeScreen(products: [makeCoke()], packs: [makeVarietyCase()])

        // A code the mirror doesn't know, so the outer sheet parks it.
        model.handleScan(bagCode, context: context)
        await model.resolver.candidateFetch?.value
        model.resolver.beginContentResolution(through: .scanner)
        let inner = try XCTUnwrap(model.resolver.contentResolver)

        inner.resolve(caseCode, context: context)

        let message = try XCTUnwrap(inner.errorMessage)
        XCTAssertTrue(message.contains("case, not an item"), "got: \(message)")
        XCTAssertTrue(model.resolver.contents.isEmpty, "the row is left alone")
        XCTAssertNotNil(model.resolver.contentResolver, "the inner flow stays open to rescan")
    }

    func testAnInnerScanRefusesAnInvalidCode() async throws {
        try makeScreen()

        model.handleScan(caseCode, context: context)
        await model.resolver.candidateFetch?.value
        model.resolver.beginContentResolution(through: .scanner)
        let inner = try XCTUnwrap(model.resolver.contentResolver)

        inner.resolve("12345", context: context)

        let message = try XCTUnwrap(inner.errorMessage)
        XCTAssertTrue(message.contains("isn't a valid barcode"), "got: \(message)")
        XCTAssertTrue(model.resolver.contents.isEmpty)
    }

    /// Two resolvers, two pending slots. Sharing one would destroy the case's
    /// own code — and with it the reason the outer sheet is open at all.
    func testAnInnerScanLeavesTheOuterPendingScanAlone() async throws {
        try makeScreen(products: [makeCoke()])

        model.handleScan(caseCode, context: context)
        await model.resolver.candidateFetch?.value
        let outerCode = try XCTUnwrap(model.resolver.pendingScan).gtin14

        model.resolver.beginContentResolution(through: .scanner)
        let inner = try XCTUnwrap(model.resolver.contentResolver)
        inner.resolve(bagCode, context: context)
        await inner.candidateFetch?.value

        XCTAssertEqual(inner.pendingScan?.gtin14, "00012345678905")
        XCTAssertEqual(
            model.resolver.pendingScan?.gtin14, outerCode,
            "the case's own code survives an inner scan"
        )
    }

    func testTheNoBarcodeDoorCreatesAProductWithNoUpc() async throws {
        try makeScreen()
        let calls = CallLog()
        api.onCreateProduct = { draft in
            calls.productDrafts.append(draft)
            return Remote.product(id: "p-loose", name: draft.name, upc: draft.upc)
        }

        model.handleScan(caseCode, context: context)
        await model.resolver.candidateFetch?.value
        model.resolver.beginContentResolution(through: .blankCreate)
        let inner = try XCTUnwrap(model.resolver.contentResolver)

        await inner.createUnit(
            name: "Loose candy", category: "snacks", priceText: "", context: context
        )

        let draft = try XCTUnwrap(calls.productDrafts.first)
        XCTAssertNil(draft.upc, "a bag with no barcode of its own gets none")
        XCTAssertEqual(model.resolver.contents.map(\.productId), ["p-loose"])
    }

    /// One MirrorCatalog, not three: a product created one level down has to be
    /// findable on the screen above without waiting for a refresh.
    func testAProductCreatedInsideACaseIsSearchableOnTheScreen() async throws {
        try makeScreen()
        api.onCreateProduct = { draft in
            Remote.product(id: "p-new", name: draft.name, upc: draft.upc)
        }

        model.handleScan(caseCode, context: context)
        await model.resolver.candidateFetch?.value
        model.resolver.beginContentResolution(through: .blankCreate)
        let inner = try XCTUnwrap(model.resolver.contentResolver)
        await inner.createUnit(
            name: "Doritos Nacho Cheese", category: "snacks", priceText: "", context: context
        )

        XCTAssertEqual(
            model.searchResults(query: "Doritos", context: context).map(\.recordId), ["p-new"],
            "the screen's own search sees it immediately"
        )
    }

    func testRescanningAProductAlreadyInTheCaseChangesNothing() async throws {
        try makeScreen(products: [makeCoke()])

        model.handleScan(caseCode, context: context)
        await model.resolver.candidateFetch?.value

        for _ in 0..<2 {
            model.resolver.beginContentResolution(through: .scanner)
            let inner = try XCTUnwrap(model.resolver.contentResolver)
            inner.resolve(cokeUpc, context: context)
        }

        XCTAssertEqual(
            model.resolver.contents.map(\.productId), ["p-coke"],
            "units are typed per row, so a second row for one product only confuses the split"
        )
    }

    // MARK: - Telling the operator it worked

    /// The scanner is opaque and stays up across a whole cart, so a scan that
    /// worked must say so — silence is indistinguishable from a dead scanner.
    func testAKnownScanReportsWhatItAdded() throws {
        try makeScreen(products: [makeCoke()])

        model.handleScan(cokeUpc, context: context)

        let confirmation = try XCTUnwrap(model.scanConfirmation)
        XCTAssertEqual(confirmation.name, "Coke Zero")
        XCTAssertEqual(confirmation.quantity, 1)
        XCTAssertEqual(confirmation.effect, .added)
        XCTAssertFalse(confirmation.isPack)
    }

    /// The count is the point: a rescan bumps an existing row, and without a
    /// number on the card that is invisible until the receipt won't add up.
    func testARescanReportsTheBumpedCount() throws {
        try makeScreen(products: [makeCoke()])

        model.handleScan(cokeUpc, context: context)
        let first = try XCTUnwrap(model.scanConfirmation)
        model.handleScan(cokeUpc, context: context)

        let second = try XCTUnwrap(model.scanConfirmation)
        XCTAssertEqual(second.quantity, 2)
        XCTAssertEqual(second.effect, .incremented)
        XCTAssertNotEqual(second.id, first.id, "a fresh id re-fires the haptic and the animation")
        XCTAssertEqual(model.rows.count, 1, "still one row, not two")
    }

    func testAPackScanReportsItselfAsACase() throws {
        try makeScreen(products: [makeCoke()], packs: [makeVarietyCase()])

        model.handleScan(caseCode, context: context)

        let confirmation = try XCTUnwrap(model.scanConfirmation)
        XCTAssertTrue(confirmation.isPack, "the badge is how scanning a case by mistake gets caught")
    }

    func testUndoingAnAddRemovesTheRow() throws {
        try makeScreen(products: [makeCoke()])
        model.handleScan(cokeUpc, context: context)

        model.undoLastScan()

        XCTAssertTrue(model.rows.isEmpty)
        XCTAssertNil(model.scanConfirmation)
    }

    /// Undoing a double-scan must step the count back, not delete the row —
    /// removing it would throw away the first scan as well.
    func testUndoingARescanStepsTheCountBackInstead() throws {
        try makeScreen(products: [makeCoke()])
        model.handleScan(cokeUpc, context: context)
        model.handleScan(cokeUpc, context: context)

        model.undoLastScan()

        XCTAssertEqual(model.rows.count, 1, "the row the first scan made stays")
        XCTAssertEqual(model.rows.first?.quantityText, "1")
        XCTAssertNil(model.scanConfirmation)
    }

    func testUndoWithNothingScannedChangesNothing() throws {
        try makeScreen(products: [makeCoke()])
        model.add(
            CatalogItem(kind: .unit(imageUrl: nil), recordId: "p-coke", name: "Coke Zero", barcode: nil)
        )

        model.undoLastScan()

        XCTAssertEqual(model.rows.count, 1, "a manual pick is not the last SCAN and Undo must not eat it")
    }

    /// The deliberate asymmetry with `CatalogSearch.items`, which hides
    /// retired records. Scanning is evidence the box is in the cart; refusing
    /// it would leave the operator with a receipt they cannot enter.
    func testScanningARetiredProductStillResolvesIt() throws {
        let retired = StoredProduct(
            id: "p-coke", name: "Coke Zero", upc: "00049000042559",
            category: "drinks", defaultPriceCents: 175, active: false
        )
        try makeScreen(products: [retired])

        model.handleScan(cokeUpc, context: context)

        XCTAssertEqual(model.rows.map(\.recordId), ["p-coke"])
        XCTAssertNil(model.resolver.pendingScan, "a retired hit is still a hit, not a question")
        XCTAssertTrue(
            model.searchResults(query: "coke", context: context).isEmpty,
            "and yet the search list still refuses to offer it"
        )
    }

    // MARK: - Telling the operator the code was read

    /// The haptic hangs off `lastReadId`, so every accepted read has to bump
    /// it — including the ones that put nothing on the purchase.
    func testAKnownScanCountsAsARead() throws {
        try makeScreen(products: [makeCoke()])

        model.handleScan(cokeUpc, context: context)

        XCTAssertNotNil(model.resolver.lastReadId)
    }

    /// The unknown path is the one that needed this: it swaps the camera for a
    /// question and adds no row, so a confirmation-shaped signal never fires.
    func testAnUnknownCodeCountsAsAReadToo() throws {
        try makeScreen(products: [makeCoke()])

        model.handleScan(caseCode, context: context)

        XCTAssertNotNil(model.resolver.pendingScan, "unknown, so the sheet is asking")
        XCTAssertNil(model.scanConfirmation, "nothing landed on the purchase to confirm")
        XCTAssertNotNil(model.resolver.lastReadId, "and yet the read happened")
    }

    /// A trigger only fires on change, so two reads of the same code must not
    /// share an id — that is the rescan the operator least expects to feel.
    func testASecondReadOfTheSameCodeGetsAFreshId() throws {
        try makeScreen(products: [makeCoke()])
        model.handleScan(cokeUpc, context: context)
        let first = try XCTUnwrap(model.resolver.lastReadId)

        model.handleScan(cokeUpc, context: context)

        XCTAssertNotEqual(model.resolver.lastReadId, first)
    }

    /// Garbage is a read as well — it just pairs with an error message, which
    /// is what turns the buzz from a success into a refusal.
    func testAnUnreadableCodeIsAReadPairedWithAnError() throws {
        try makeScreen(products: [makeCoke()])

        model.handleScan("12345", context: context)

        XCTAssertNotNil(model.resolver.lastReadId)
        XCTAssertNotNil(model.resolver.errorMessage)
    }

    // MARK: - Manual entry

    func testSearchResultsComeFromTheMirror() throws {
        try makeScreen(products: [makeCoke(), makeDoritos()], packs: [makeVarietyCase()])

        let results = model.searchResults(query: "co", context: context)

        XCTAssertEqual(results.map(\.recordId), ["p-coke", "k-variety"])
    }

    func testResolvingAScanClosesAParkedSheet() throws {
        try makeScreen(products: [makeCoke()])
        model.handleScan(caseCode, context: context)
        XCTAssertNotNil(model.resolver.pendingScan)

        model.handleScan(cokeUpc, context: context)

        XCTAssertNil(model.resolver.pendingScan, "a parked sheet must not sit over a row already in the list")
        XCTAssertEqual(model.rows.count, 1)
    }

    func testAManualPickClosesAParkedSheet() throws {
        try makeScreen(products: [makeCoke()])
        model.handleScan(caseCode, context: context)
        let item = try XCTUnwrap(model.searchResults(query: "coke", context: context).first)

        model.add(item)

        XCTAssertNil(model.resolver.pendingScan)
        XCTAssertEqual(model.rows.count, 1)
    }

    func testRemoveRowDropsIt() throws {
        try makeScreen(products: [makeCoke()])
        model.handleScan(cokeUpc, context: context)
        let row = try XCTUnwrap(model.rows.first)

        model.removeRow(id: row.id)

        XCTAssertTrue(model.rows.isEmpty)
    }

    // MARK: - Draft cases

    /// "It's a case of items" commits on the spot: a flagged row lands now,
    /// well before the case has a name or anything inside it.
    func testCommittingACaseAddsAFlaggedDraftRow() async throws {
        try makeScreen()
        model.handleScan(caseCode, context: context)
        await model.resolver.candidateFetch?.value

        model.resolver.commitPendingCase()

        XCTAssertEqual(model.rows.count, 1)
        let row = try XCTUnwrap(model.rows.first)
        XCTAssertEqual(row.kind, .packDraft)
        XCTAssertEqual(row.name, "New case")
        XCTAssertEqual(row.quantityText, "1")
        XCTAssertTrue(row.isPack, "a draft still reads as a case, not a unit")

        let draft = try XCTUnwrap(model.packDrafts[row.recordId])
        XCTAssertEqual(draft.pendingScan?.gtin14, caseCode)
        XCTAssertTrue(draft.allowsPacks)
    }

    /// Committing a case drops the sheet back to the camera, so the card is
    /// the only thing that says a row landed at all.
    func testCommittingACaseReportsItselfOnTheCard() async throws {
        try makeScreen()
        model.handleScan(caseCode, context: context)
        await model.resolver.candidateFetch?.value

        model.resolver.commitPendingCase()

        let row = try XCTUnwrap(model.rows.first)
        let confirmation = try XCTUnwrap(model.scanConfirmation)
        XCTAssertEqual(confirmation.rowId, row.id)
        XCTAssertEqual(confirmation.effect, .caseStarted)
        XCTAssertEqual(confirmation.name, "New case")
        XCTAssertTrue(confirmation.isPack, "the badge is what distinguishes it from a unit")
    }

    /// "New case" says nothing about which box is on the purchase. When the
    /// outside guess landed, it names the row and the card both.
    func testACommittedCaseTakesItsNameFromTheOutsideGuess() async throws {
        try makeScreen()
        api.onFetchBarcodeCandidate = { _ in
            RemoteCandidate(name: "30ct Variety", brand: "Frito-Lay", imageUrl: nil)
        }
        model.handleScan(caseCode, context: context)
        await model.resolver.candidateFetch?.value

        model.resolver.commitPendingCase()

        let row = try XCTUnwrap(model.rows.first)
        XCTAssertEqual(row.name, "Frito-Lay 30ct Variety")
        XCTAssertEqual(model.scanConfirmation?.name, "Frito-Lay 30ct Variety")
    }

    /// Undo has to take the resolver with the row. Leaving it behind would
    /// strand a case nothing on screen can reach or finish.
    func testUndoingACommittedCaseTakesItsDraftWithIt() async throws {
        try makeScreen()
        model.handleScan(caseCode, context: context)
        await model.resolver.candidateFetch?.value
        model.resolver.commitPendingCase()

        model.undoLastScan()

        XCTAssertTrue(model.rows.isEmpty)
        XCTAssertTrue(model.packDrafts.isEmpty, "the draft resolver goes with its row")
        XCTAssertNil(model.scanConfirmation)
    }

    /// The resolver that asked goes right back to resolving the next scan —
    /// the sheet never has to close for this, and nothing about it should
    /// still be "thinking about" the case that was just handed off.
    func testCommittingACaseLeavesTheSharedResolverReadyForTheNextScan() async throws {
        try makeScreen(products: [makeCoke()])
        model.handleScan(caseCode, context: context)
        await model.resolver.candidateFetch?.value

        model.resolver.commitPendingCase()
        XCTAssertNil(model.resolver.pendingScan)

        model.handleScan(cokeUpc, context: context)

        XCTAssertEqual(model.rows.map(\.kind), [.packDraft, .unit])
    }

    /// Finishing the case in `CaseContentsView` resolves the draft into a
    /// real row — keeping whatever quantity or cost the operator already
    /// typed in, rather than starting the line over.
    func testFinishingADraftReplacesItsRowKeepingQuantityAndCost() async throws {
        try makeScreen(products: [makeCoke()])
        api.onCreatePack = { draft in Remote.pack(id: "k-new", name: draft.name, contents: draft.contents) }

        model.handleScan(caseCode, context: context)
        await model.resolver.candidateFetch?.value
        model.resolver.commitPendingCase()

        let draftRow = try XCTUnwrap(model.rows.first)
        model.updateRow(id: draftRow.id, quantityText: "3", totalCostText: "19.99")
        let draft = try XCTUnwrap(model.packDrafts[draftRow.recordId])
        addContent(to: draft, productId: "p-coke", name: "Coke Zero", units: "20")

        await draft.createPack(name: "Costco variety case", context: context)

        XCTAssertEqual(model.rows.count, 1, "the draft is replaced in place, not appended alongside")
        let resolved = try XCTUnwrap(model.rows.first)
        XCTAssertEqual(resolved.id, draftRow.id)
        XCTAssertEqual(resolved.kind, .pack)
        XCTAssertEqual(resolved.recordId, "k-new")
        XCTAssertEqual(resolved.name, "Costco variety case")
        XCTAssertEqual(resolved.quantityText, "3", "already-typed quantity survives")
        XCTAssertEqual(resolved.totalCostText, "19.99", "already-typed cost survives")
        XCTAssertNil(model.packDrafts[draftRow.recordId], "a resolved draft is not still tracked")
    }

    /// A case with nothing in it yet must not reach the server as a line —
    /// `createPack` was never even called.
    func testSaveRefusesAnEmptyDraftCase() async throws {
        try makeScreen()
        model.handleScan(caseCode, context: context)
        await model.resolver.candidateFetch?.value
        model.resolver.commitPendingCase()

        XCTAssertFalse(model.save(context: context))
        let message = try XCTUnwrap(model.errorMessage)
        XCTAssertTrue(message.contains("contents"), "got: \(message)")
        XCTAssertTrue(try fetchOutbox().isEmpty)
    }

    /// Deleting a draft row has to drop its resolver too, or a finished case
    /// elsewhere could resurrect a row nothing points at anymore.
    func testRemovingADraftRowDropsItsResolverToo() async throws {
        try makeScreen()
        model.handleScan(caseCode, context: context)
        await model.resolver.candidateFetch?.value
        model.resolver.commitPendingCase()
        let row = try XCTUnwrap(model.rows.first)

        model.removeRow(id: row.id)

        XCTAssertTrue(model.rows.isEmpty)
        XCTAssertTrue(model.packDrafts.isEmpty)
    }

    /// Put a product into a specific draft's case, the way the Search door
    /// does — no network, no inner resolver. Like `addContent`, but for a
    /// resolver that was detached rather than `model.resolver` itself.
    private func addContent(to draft: BarcodeResolutionModel, productId: String, name: String, units: String) {
        draft.addContent(
            CatalogItem(kind: .unit(imageUrl: nil), recordId: productId, name: name, barcode: nil)
        )
        guard let added = draft.contents.last else {
            return XCTFail("addContent did not append a row")
        }
        draft.updateContent(id: added.id, unitsText: units)
    }
}
