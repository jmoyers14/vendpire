import XCTest

@testable import Vendpire

/// Runs the same `vectors.json` the TypeScript suite does — the file is a
/// symlink to `packages/domain/src/gtin/vectors.json`, so a case added there is
/// added to both suites and the two implementations cannot drift.
final class GtinTests: XCTestCase {
    private var vectors: Vectors!

    override func setUpWithError() throws {
        let bundle = Bundle(for: GtinTests.self)
        let url = try XCTUnwrap(
            bundle.url(forResource: "vectors", withExtension: "json"),
            "vectors.json is not in the test bundle"
        )
        vectors = try JSONDecoder().decode(Vectors.self, from: Data(contentsOf: url))
    }

    func testCheckDigits() {
        for vector in vectors.checkDigits {
            XCTAssertEqual(
                Gtin.gs1CheckDigit(vector.digits),
                vector.expected,
                "\(vector.digits) — \(vector.note)"
            )
        }
    }

    func testNormalize() {
        for vector in vectors.normalize {
            let actual = Gtin.normalize(vector.input)
            let label = "\(vector.input.debugDescription) — \(vector.note)"

            guard let expected = vector.expected else {
                XCTAssertNil(actual, label)
                continue
            }
            XCTAssertEqual(actual?.gtin14, expected.gtin14, label)
            XCTAssertEqual(actual?.format.rawValue, expected.format, label)
            XCTAssertEqual(actual?.likelyCase, expected.likelyCase, label)
        }
    }

    func testEquivalences() {
        for vector in vectors.equivalences {
            let normalized = Set(vector.inputs.compactMap { Gtin.normalize($0)?.gtin14 })
            XCTAssertEqual(
                normalized.count,
                1,
                "\(vector.inputs) should share one GTIN-14 — \(vector.note)"
            )
        }
    }

    /// A vectors file that silently lost its cases would make every test above
    /// pass vacuously.
    func testVectorsAreLoaded() {
        XCTAssertFalse(vectors.checkDigits.isEmpty)
        XCTAssertGreaterThan(vectors.normalize.count, 10)
        XCTAssertFalse(vectors.equivalences.isEmpty)
        XCTAssertTrue(
            vectors.normalize.contains { $0.expected == nil },
            "the rejection cases are what stop a permissive port passing"
        )
    }
}

private struct Vectors: Decodable {
    let checkDigits: [CheckDigit]
    let normalize: [Normalize]
    let equivalences: [Equivalence]

    struct CheckDigit: Decodable {
        let digits: String
        let expected: Int
        let note: String
    }

    struct Normalize: Decodable {
        let input: String
        let note: String
        /// Null for inputs that must not normalize at all.
        let expected: Expected?

        struct Expected: Decodable {
            let gtin14: String
            let format: String
            let likelyCase: Bool
        }
    }

    struct Equivalence: Decodable {
        let note: String
        let inputs: [String]
    }
}
