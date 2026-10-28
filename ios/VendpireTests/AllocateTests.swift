import XCTest
@testable import Vendpire

final class AllocateTests: XCTestCase {
    private struct Vectors: Decodable {
        struct Case: Decodable { let totalCents: Int; let weights: [Int]; let expected: [Int]; let note: String }
        let allocate: [Case]
    }

    private var vectors: Vectors!

    override func setUpWithError() throws {
        let bundle = Bundle(for: AllocateTests.self)
        let url = try XCTUnwrap(
            bundle.url(forResource: "allocate-vectors", withExtension: "json"),
            "allocate-vectors.json is not in the test bundle"
        )
        vectors = try JSONDecoder().decode(Vectors.self, from: Data(contentsOf: url))
    }

    func testEveryVectorMatchesTheReferenceImplementation() {
        for v in vectors.allocate {
            XCTAssertEqual(Allocate.proportionally(totalCents: v.totalCents, weights: v.weights),
                           v.expected, v.note)
        }
    }

    func testVectorsHaveNotEroded() {
        XCTAssertGreaterThanOrEqual(vectors.allocate.count, 5)
        XCTAssertTrue(vectors.allocate.contains { $0.totalCents == 0 })
    }
}
