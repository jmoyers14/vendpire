import XCTest
@testable import Vendpire

final class PurchaseSubmissionTests: XCTestCase {
    private func submission() -> PurchaseSubmission {
        PurchaseSubmission(
            purchasedAt: Date(timeIntervalSince1970: 1_790_000_000),
            vendor: "Costco",
            lines: [.init(productId: "a".padding(toLength: 24, withPad: "a", startingAt: 0),
                          units: 24, totalCostCents: 1299, packId: nil)],
            packLines: [.init(packId: "b".padding(toLength: 24, withPad: "b", startingAt: 0),
                              qty: 2, totalCostCents: 3798)],
            receiptTotalCents: 5097,
            notes: nil,
            clientRequestId: "test-request-id-1234"
        )
    }

    func testRoundTripsThroughItsOwnCoders() throws {
        let data = try PurchaseSubmission.makeEncoder().encode(submission())
        let back = try PurchaseSubmission.makeDecoder().decode(PurchaseSubmission.self, from: data)
        XCTAssertEqual(back, submission())
    }

    func testDatesEncodeAsIso8601() throws {
        let data = try PurchaseSubmission.makeEncoder().encode(submission())
        let json = String(decoding: data, as: UTF8.self)
        XCTAssertTrue(json.contains("\"purchasedAt\":\"2026-"), json)
    }

    @MainActor
    func testOutboxItemCarriesTheKindAndId() throws {
        let item = try OutboxItem(purchase: submission())
        XCTAssertEqual(item.kind, "purchase")
        XCTAssertEqual(item.id, "test-request-id-1234")
        XCTAssertEqual(item.countedAt, submission().purchasedAt)
        let decoded = try PurchaseSubmission.makeDecoder()
            .decode(PurchaseSubmission.self, from: item.payload)
        XCTAssertEqual(decoded, submission())
    }
}
