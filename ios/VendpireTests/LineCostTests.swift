import XCTest

@testable import Vendpire

/// A receipt line's arithmetic: whichever way the receipt prints the cost,
/// the row it becomes holds the line total.
final class LineCostTests: XCTestCase {
    private let coke = CatalogItem(
        kind: .unit(imageUrl: nil), recordId: "p-coke", name: "Coke Zero", barcode: nil
    )
    private let cokeCase = CatalogItem(
        kind: .pack(units: 35), recordId: "k-coke", name: "Coke Zero 35pk", barcode: nil
    )

    private func makeCost(
        quantity: String = "1",
        amount: String = "",
        mode: LineCost.Mode = .total
    ) -> LineCost {
        LineCost(mode: mode, quantityText: quantity, amountText: amount)
    }

    private func makeEntry(
        quantity: String = "1",
        amount: String = "",
        mode: LineCost.Mode = .total
    ) -> LineEntry {
        LineEntry(item: coke, cost: makeCost(quantity: quantity, amount: amount, mode: mode))
    }

    func testANewCostIsOneWithNothingTyped() {
        let cost = LineCost(mode: .each)

        XCTAssertEqual(cost.quantityText, "1")
        XCTAssertEqual(cost.amountText, "")
        XCTAssertEqual(cost.mode, .each)
        XCTAssertFalse(cost.isComplete)
    }

    func testTotalModeTakesTheAmountAsTheLineTotal() {
        XCTAssertEqual(makeCost(quantity: "3", amount: "10.00", mode: .total).lineTotalCents, 1000)
    }

    func testEachModeMultipliesByQuantity() {
        XCTAssertEqual(makeCost(quantity: "3", amount: "10.00", mode: .each).lineTotalCents, 3000)
    }

    func testTheCounterpartIsTheNumberNotTyped() {
        XCTAssertEqual(
            makeCost(quantity: "3", amount: "10.00", mode: .total).counterpartCents, 333,
            "$10.00 for three reads as $3.33 each"
        )
        XCTAssertEqual(makeCost(quantity: "2", amount: "12.99", mode: .each).counterpartCents, 2598)
    }

    func testTheCounterpartIsSilentAtQuantityOne() {
        XCTAssertNil(makeCost(quantity: "1", amount: "12.99").counterpartCents)
    }

    func testIncompleteUntilQuantityAndAmountBothParse() {
        XCTAssertFalse(makeCost(quantity: "1", amount: "").isComplete)
        XCTAssertFalse(makeCost(quantity: "1", amount: "abc").isComplete)
        XCTAssertFalse(makeCost(quantity: "0", amount: "1.00").isComplete)
        XCTAssertFalse(makeCost(quantity: "-2", amount: "1.00").isComplete)
        XCTAssertFalse(makeCost(quantity: "1.5", amount: "1.00").isComplete)
        XCTAssertFalse(makeCost(quantity: "", amount: "1.00").isComplete)
        XCTAssertTrue(makeCost(quantity: " 2 ", amount: "1.00").isComplete)
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

    func testANewCaseIsReadyOnceNamedAndPriced() {
        XCTAssertFalse(NewCaseDraft(name: "", cost: makeCost(amount: "18.99")).isReadyForContents)
        XCTAssertFalse(NewCaseDraft(name: "Coke 35pk", cost: makeCost(amount: "")).isReadyForContents)
        XCTAssertTrue(NewCaseDraft(name: "Coke 35pk", cost: makeCost(amount: "18.99")).isReadyForContents)
    }

    func testACaseEntryBecomesAPackRow() {
        let row = LineEntry(item: cokeCase, cost: LineCost(mode: .total)).makeRow()

        XCTAssertEqual(row.kind, .pack)
        XCTAssertEqual(row.recordId, "k-coke")
    }
}
