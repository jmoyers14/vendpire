import XCTest

@testable import Vendpire

/// Ported from `packages/web/src/screens/purchases/catalogSearch.test.ts` —
/// same inputs, same expected ranking.
final class CatalogSearchTests: XCTestCase {
    private func product(
        id: String = "p1",
        name: String = "Coke Zero 12oz",
        upc: String? = nil,
        imageUrl: String? = nil,
        active: Bool = true
    ) -> StoredProduct {
        StoredProduct(id: id, name: name, upc: upc, category: "drinks", imageUrl: imageUrl, defaultPriceCents: 175, active: active)
    }

    private func pack(
        id: String = "k1",
        name: String = "Coke Zero — case (24)",
        barcodes: [String] = ["10049000042556"],
        contents: [PackContent] = [PackContent(productId: "p1", units: 24)],
        active: Bool = true
    ) -> StoredPack {
        StoredPack(id: id, name: name, barcodes: barcodes, contents: contents, active: active)
    }

    // MARK: - items

    func testPutsProductsAndPacksInOneListTaggedByKind() {
        let items = CatalogSearch.items(products: [product()], packs: [pack()])
        XCTAssertEqual(items.map(\.isPack), [false, true])
    }

    func testCarriesAProductsUpcAndAPacksFirstBarcode() {
        let items = CatalogSearch.items(
            products: [product(upc: "00049000042559")],
            packs: [pack(barcodes: ["10049000042556", "20049000042553"])]
        )
        XCTAssertEqual(items[0].barcode, "00049000042559")
        XCTAssertEqual(items[1].barcode, "10049000042556")
    }

    func testReportsNilBarcodeForAProductThatHasNoCodeYet() {
        let items = CatalogSearch.items(products: [product(upc: nil)], packs: [])
        XCTAssertNil(items[0].barcode)
    }

    func testTotalsAPacksUnitsAcrossItsContents() {
        let items = CatalogSearch.items(
            products: [],
            packs: [pack(contents: [
                PackContent(productId: "p1", units: 12),
                PackContent(productId: "p2", units: 23),
            ])]
        )
        guard case .pack(let units) = items[0].kind else { return XCTFail("expected a pack item") }
        XCTAssertEqual(units, 35)
    }

    func testLeavesOutInactiveRecords() {
        let items = CatalogSearch.items(products: [product(active: false)], packs: [pack(active: false)])
        XCTAssertEqual(items, [])
    }

    // MARK: - search

    private func searchableItems() -> [CatalogItem] {
        CatalogSearch.items(
            products: [
                product(id: "p1", name: "Coke Zero 12oz"),
                product(id: "p2", name: "Diet Coke 12oz"),
                product(id: "p3", name: "Doritos Nacho Cheese"),
            ],
            packs: [pack(id: "k1", name: "Coke Zero — case (24)")]
        )
    }

    func testReturnsNothingForAnEmptyQuery() {
        XCTAssertEqual(CatalogSearch.search(searchableItems(), query: "   "), [])
    }

    func testMatchesCaseInsensitively() {
        let ids = CatalogSearch.search(searchableItems(), query: "DORITOS").map(\.recordId)
        XCTAssertEqual(ids, ["p3"])
    }

    func testFindsProductsAndPacksInTheSameResultList() {
        let isPackFlags = CatalogSearch.search(searchableItems(), query: "coke zero").map(\.isPack)
        XCTAssertTrue(isPackFlags.contains(false))
        XCTAssertTrue(isPackFlags.contains(true))
    }

    func testRanksALeadingMatchAboveAMidNameOne() {
        let ids = CatalogSearch.search(searchableItems(), query: "coke").map(\.recordId)
        XCTAssertLessThan(ids.firstIndex(of: "p1")!, ids.firstIndex(of: "p2")!)
    }

    func testRequiresEveryTermToMatchSoExtraWordsNarrow() {
        XCTAssertEqual(CatalogSearch.search(searchableItems(), query: "coke doritos"), [])
    }

    func testHonoursTheLimit() {
        XCTAssertEqual(CatalogSearch.search(searchableItems(), query: "coke", limit: 1).count, 1)
    }

    // MARK: - ranking (position scoring, ties)

    func testExactNameBeatsPrefixBeatsWordStartBeatsMidWord() {
        // Term "oke" so all four position bins are distinct: "Smoke" is a
        // genuine mid-word match (preceded by "m"), unlike "Costco Coke" in
        // the web module's own doc comment, where "coke" is preceded by a
        // space and so ties with "Diet Coke" on score (both word-start) and
        // is only sorted after it by the shorter-name tiebreak.
        let items = CatalogSearch.items(
            products: [
                product(id: "exact", name: "Oke"),
                product(id: "prefix", name: "Okey Dokey"),
                product(id: "wordStart", name: "Big Oke"),
                product(id: "midWord", name: "Smoke"),
            ],
            packs: []
        )
        let ids = CatalogSearch.search(items, query: "oke").map(\.recordId)
        XCTAssertEqual(ids, ["exact", "prefix", "wordStart", "midWord"])
    }

    func testTiesBreakToTheShorterName() {
        let items = CatalogSearch.items(
            products: [
                product(id: "long", name: "Coke Zero Extra"),
                product(id: "short", name: "Coke Zero"),
            ],
            packs: []
        )
        let ids = CatalogSearch.search(items, query: "coke zero").map(\.recordId)
        XCTAssertEqual(ids, ["short", "long"])
    }
}
