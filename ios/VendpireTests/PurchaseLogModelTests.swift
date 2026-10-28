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
        XCTAssertNil(model.pendingScan)
        XCTAssertNil(model.errorMessage)
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
        await model.candidateFetch?.value

        let pending = try XCTUnwrap(model.pendingScan)
        XCTAssertEqual(pending.gtin14, "10049000042556")
        XCTAssertTrue(pending.likelyCase)
        XCTAssertTrue(model.rows.isEmpty, "an unknown code adds nothing until the sheet resolves it")
        XCTAssertNil(model.errorMessage, "not-found is a question, not an error")
    }

    /// The candidate is a guess from an outside database. A lookup that fails
    /// must leave the sheet usable, not block entry.
    func testACandidateLookupFailureNeverBlocksEntry() async throws {
        try makeScreen()
        api.onFetchBarcodeCandidate = { _ in throw StubError.unreachable }

        model.handleScan(caseCode, context: context)
        await model.candidateFetch?.value

        XCTAssertNotNil(model.pendingScan)
        XCTAssertNil(model.pendingScan?.candidate)
        XCTAssertNil(model.errorMessage)
    }

    func testACandidateLookupFillsTheSheet() async throws {
        try makeScreen()
        api.onFetchBarcodeCandidate = { _ in
            RemoteCandidate(name: "Coca-Cola Zero", brand: "Coca-Cola", imageUrl: "https://x/i.png")
        }

        model.handleScan(caseCode, context: context)
        await model.candidateFetch?.value

        XCTAssertEqual(model.pendingScan?.candidate?.name, "Coca-Cola Zero")
    }

    func testInvalidScanSetsAnErrorAndNothingElse() throws {
        try makeScreen(products: [makeCoke()])

        model.handleScan("12345", context: context)

        let message = try XCTUnwrap(model.errorMessage)
        XCTAssertTrue(message.contains("12345"), "the operator needs to see which digits failed")
        XCTAssertTrue(model.rows.isEmpty)
        XCTAssertNil(model.pendingScan)
    }

    // MARK: - Reconciliation

    func testVarianceReadsOverAndUnder() throws {
        try makeScreen(products: [makeCoke()])
        model.handleScan(cokeUpc, context: context)
        let row = try XCTUnwrap(model.rows.first)
        model.updateRow(id: row.id, totalCostText: "12.99")

        XCTAssertEqual(model.enteredCents, 1299)
        XCTAssertNil(model.varianceCents, "no receipt total means nothing to reconcile against")

        model.receiptTotalText = "10.00"
        XCTAssertEqual(model.varianceCents, 299, "entered above the receipt reads positive")

        model.receiptTotalText = "15.00"
        XCTAssertEqual(model.varianceCents, -201, "entered below the receipt reads negative")
    }

    // MARK: - Saving

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

    // MARK: - Attaching a code to something that already exists

    func testAttachAddsTheRowAndMirrorsTheRecord() async throws {
        try makeScreen(products: [makeCoke()])
        let calls = CallLog()
        api.onAttachProductBarcode = { productId, code in
            calls.attachedProducts.append((productId, code))
            return Remote.product(id: productId, name: "Coke Zero", upc: code)
        }

        model.handleScan(caseCode, context: context)
        await model.candidateFetch?.value
        let item = try XCTUnwrap(model.searchResults(query: "coke", context: context).first)
        await model.attach(to: item, context: context)

        XCTAssertEqual(calls.attachedProducts.map(\.productId), ["p-coke"])
        XCTAssertEqual(calls.attachedProducts.map(\.code), ["10049000042556"])
        XCTAssertNil(model.pendingScan, "a resolved scan closes the sheet")
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
        await model.candidateFetch?.value
        let item = try XCTUnwrap(model.searchResults(query: "coke", context: context).first)
        await model.attach(to: item, context: context)

        XCTAssertNotNil(model.errorMessage)
        XCTAssertNotNil(model.pendingScan, "the sheet stays open so the operator can try again")
        XCTAssertTrue(model.rows.isEmpty)
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
        await model.candidateFetch?.value
        await model.createUnit(
            name: "Coke Zero", category: "drinks", priceText: "1.75", context: context
        )

        let draft = try XCTUnwrap(calls.productDrafts.first)
        XCTAssertEqual(draft.name, "Coke Zero")
        XCTAssertEqual(draft.upc, "10049000042556", "the scanned code becomes the unit's upc")
        XCTAssertEqual(draft.category, "drinks")
        XCTAssertEqual(draft.imageUrl, "https://x/i.png")
        XCTAssertEqual(draft.defaultPriceCents, 175)

        XCTAssertNil(model.pendingScan)
        XCTAssertEqual(model.rows.first?.recordId, "p-new")
        XCTAssertEqual(try fetchStoredProducts().count, 1, "the new product is mirrored immediately")
    }

    func testCreateUnitRequiresANameAndCategory() async throws {
        try makeScreen()
        model.handleScan(caseCode, context: context)
        await model.candidateFetch?.value

        await model.createUnit(name: "  ", category: "drinks", priceText: "", context: context)

        XCTAssertNotNil(model.errorMessage)
        XCTAssertNotNil(model.pendingScan)
        XCTAssertTrue(model.rows.isEmpty)
    }

    func testCreatePackCreatesItsNewProductsFirst() async throws {
        try makeScreen(products: [makeCoke()])
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
        await model.candidateFetch?.value
        await model.createPack(
            name: "Costco variety case",
            contents: [
                PurchaseLogModel.NewPackContent(
                    productId: "p-coke", unitsText: "20", name: "", category: "", bagCode: ""
                ),
                PurchaseLogModel.NewPackContent(
                    productId: nil, unitsText: "10", name: "Doritos Nacho Cheese",
                    category: "snacks", bagCode: bagCode
                ),
            ],
            context: context
        )

        XCTAssertEqual(calls.productDrafts.count, 1, "only the row without a product id is created")
        XCTAssertEqual(calls.productDrafts.first?.upc, "00012345678905", "the bag keeps its OWN code")

        let draft = try XCTUnwrap(calls.packDrafts.first)
        XCTAssertEqual(draft.name, "Costco variety case")
        XCTAssertEqual(draft.barcodes, ["10049000042556"], "the scanned code belongs to the case")
        XCTAssertEqual(
            draft.contents,
            [PackContent(productId: "p-coke", units: 20), PackContent(productId: "p-new", units: 10)]
        )
        XCTAssertNil(model.pendingScan)
        XCTAssertEqual(model.rows.first?.kind, .pack)
        XCTAssertEqual(model.rows.first?.recordId, "k-new")
    }

    /// A failure partway leaves the products behind — they are records the
    /// operator wanted anyway, and a rerun picks them out of the mirror
    /// rather than duplicating them.
    func testCreatePackKeepsProductsCreatedBeforeTheFailure() async throws {
        try makeScreen()
        api.onCreateProduct = { draft in
            Remote.product(id: "p-new", name: draft.name, upc: draft.upc)
        }
        api.onCreatePack = { _ in throw StubError.unreachable }

        model.handleScan(caseCode, context: context)
        await model.candidateFetch?.value
        await model.createPack(
            name: "Costco variety case",
            contents: [
                PurchaseLogModel.NewPackContent(
                    productId: nil, unitsText: "10", name: "Doritos Nacho Cheese",
                    category: "snacks", bagCode: ""
                )
            ],
            context: context
        )

        XCTAssertNotNil(model.errorMessage)
        XCTAssertNotNil(model.pendingScan, "the sheet stays open to retry")
        XCTAssertEqual(
            try fetchStoredProducts().map(\.id), ["p-new"],
            "the product that was created stays created"
        )
    }

    func testCreatePackRejectsAnUnparseableBagCode() async throws {
        try makeScreen()

        model.handleScan(caseCode, context: context)
        await model.candidateFetch?.value
        await model.createPack(
            name: "Costco variety case",
            contents: [
                PurchaseLogModel.NewPackContent(
                    productId: nil, unitsText: "10", name: "Doritos",
                    category: "snacks", bagCode: "12345"
                )
            ],
            context: context
        )

        let message = try XCTUnwrap(model.errorMessage)
        XCTAssertTrue(message.contains("Product 1"), "the error names the row, got: \(message)")
        XCTAssertEqual(try fetchStoredProducts().count, 0, "nothing is created once a row fails")
    }

    // MARK: - Manual entry

    func testSearchResultsComeFromTheMirror() throws {
        try makeScreen(products: [makeCoke(), makeDoritos()], packs: [makeVarietyCase()])

        let results = model.searchResults(query: "co", context: context)

        XCTAssertEqual(results.map(\.recordId), ["p-coke", "k-variety"])
    }

    func testRemoveRowDropsIt() throws {
        try makeScreen(products: [makeCoke()])
        model.handleScan(cokeUpc, context: context)
        let row = try XCTUnwrap(model.rows.first)

        model.removeRow(id: row.id)

        XCTAssertTrue(model.rows.isEmpty)
    }
}
