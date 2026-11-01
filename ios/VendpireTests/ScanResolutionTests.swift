import XCTest

@testable import Vendpire

/// `ScanResolution.resolve` is the resolver's first two arms, relocated
/// on-device: product by upc, then pack by barcodes contains, then
/// unknown(gtin14, likelyCase), then invalid.
final class ScanResolutionTests: XCTestCase {
    private func product(id: String, upc: String) -> StoredProduct {
        StoredProduct(id: id, name: "Coke", upc: upc, category: "drinks", defaultPriceCents: 175)
    }

    private func pack(id: String, barcodes: [String]) -> StoredPack {
        StoredPack(id: id, name: "Coke case", barcodes: barcodes, contents: [PackContent(productId: "p1", units: 24)])
    }

    func testOwnProductBeatsEverything() {
        let products = [product(id: "p1", upc: "00049000042559")]
        XCTAssertEqual(
            ScanResolution.resolve("049000042559", products: products, packs: []),
            .product(id: "p1")
        )
    }

    func testPackByAnyOfItsCaseCodes() {
        let packs = [pack(id: "k1", barcodes: ["10049000042556"])]
        XCTAssertEqual(
            ScanResolution.resolve("10049000042556", products: [], packs: packs),
            .pack(id: "k1")
        )
    }

    func testProductWinsWhenMirrorSomehowHoldsBoth() {
        let products = [product(id: "p1", upc: "10049000042556")]
        let packs = [pack(id: "k1", barcodes: ["10049000042556"])]
        XCTAssertEqual(
            ScanResolution.resolve("10049000042556", products: products, packs: packs),
            .product(id: "p1")
        )
    }

    func testUnknownCarriesGtin14AndLikelyCase() {
        guard case .unknown(let gtin14, let likelyCase) =
            ScanResolution.resolve("10049000042556", products: [], packs: [])
        else { return XCTFail("expected .unknown") }
        XCTAssertEqual(gtin14, "10049000042556")
        XCTAssertTrue(likelyCase)
    }

    func testGarbageIsInvalid() {
        XCTAssertEqual(ScanResolution.resolve("hello", products: [], packs: []), .invalid)
    }
}
