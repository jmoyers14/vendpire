import XCTest

@testable import Vendpire

/// The Entry screen's arithmetic: whichever way the receipt prints the cost,
/// the row it becomes holds the line total.
final class LineEntryTests: XCTestCase {
    private let coke = CatalogItem(
        kind: .unit(imageUrl: nil), recordId: "p-coke", name: "Coke Zero", barcode: nil
    )
    private let cokeCase = CatalogItem(
        kind: .pack(units: 35), recordId: "k-coke", name: "Coke Zero 35pk", barcode: nil
    )

    private func makeEntry(
        quantity: String = "1",
        amount: String = "",
        mode: LineEntry.CostEntryMode = .total
    ) -> LineEntry {
        LineEntry(item: coke, mode: mode, quantityText: quantity, amountText: amount)
    }

    func testANewEntryIsOneOfTheItemWithNoCost() {
        let entry = LineEntry(item: coke, mode: .each)

        XCTAssertEqual(entry.quantityText, "1")
        XCTAssertEqual(entry.amountText, "")
        XCTAssertEqual(entry.mode, .each)
        XCTAssertFalse(entry.isComplete)
    }

    func testTotalModeTakesTheAmountAsTheLineTotal() {
        XCTAssertEqual(makeEntry(quantity: "3", amount: "10.00", mode: .total).lineTotalCents, 1000)
    }

    func testEachModeMultipliesByQuantity() {
        XCTAssertEqual(makeEntry(quantity: "3", amount: "10.00", mode: .each).lineTotalCents, 3000)
    }

    func testTheCounterpartIsTheNumberNotTyped() {
        XCTAssertEqual(
            makeEntry(quantity: "3", amount: "10.00", mode: .total).counterpartCents, 333,
            "$10.00 for three reads as $3.33 each"
        )
        XCTAssertEqual(makeEntry(quantity: "2", amount: "12.99", mode: .each).counterpartCents, 2598)
    }

    func testTheCounterpartIsSilentAtQuantityOne() {
        XCTAssertNil(makeEntry(quantity: "1", amount: "12.99").counterpartCents)
    }

    func testIncompleteUntilQuantityAndAmountBothParse() {
        XCTAssertFalse(makeEntry(quantity: "1", amount: "").isComplete)
        XCTAssertFalse(makeEntry(quantity: "1", amount: "abc").isComplete)
        XCTAssertFalse(makeEntry(quantity: "0", amount: "1.00").isComplete)
        XCTAssertFalse(makeEntry(quantity: "-2", amount: "1.00").isComplete)
        XCTAssertFalse(makeEntry(quantity: "1.5", amount: "1.00").isComplete)
        XCTAssertFalse(makeEntry(quantity: "", amount: "1.00").isComplete)
        XCTAssertTrue(makeEntry(quantity: " 2 ", amount: "1.00").isComplete)
    }

    func testTheRowHoldsTheLineTotalInEitherMode() {
        let total = makeEntry(quantity: "2", amount: "25.98", mode: .total).makeRow()
        let each = makeEntry(quantity: "2", amount: "12.99", mode: .each).makeRow()

        XCTAssertEqual(total.totalCostText, "25.98")
        XCTAssertEqual(each.totalCostText, "25.98")
        XCTAssertEqual(each.quantityText, "2")
        XCTAssertEqual(each.kind, .unit)
        XCTAssertEqual(each.recordId, "p-coke")
        XCTAssertEqual(each.name, "Coke Zero")
    }

    func testACaseEntryBecomesAPackRow() {
        let row = LineEntry(item: cokeCase, mode: .total).makeRow()

        XCTAssertEqual(row.kind, .pack)
        XCTAssertEqual(row.recordId, "k-coke")
    }
}
