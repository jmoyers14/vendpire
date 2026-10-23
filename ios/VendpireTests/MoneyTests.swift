import XCTest

@testable import Vendpire

/// Money is `Int` cents everywhere in the app. This is the only place it
/// becomes a string, so rounding and padding mistakes have one home.
final class MoneyTests: XCTestCase {
    func testWholeDollarsKeepTwoDecimalPlaces() {
        XCTAssertEqual(priceText(cents: 200), "$2.00")
    }

    func testCentsBelowTenAreZeroPadded() {
        XCTAssertEqual(priceText(cents: 205), "$2.05")
    }

    func testATypicalPriceFormats() {
        XCTAssertEqual(priceText(cents: 175), "$1.75")
    }

    func testFreeIsZeroNotBlank() {
        XCTAssertEqual(priceText(cents: 0), "$0.00")
    }

    func testPricesAboveTenDollarsDoNotLoseDigits() {
        XCTAssertEqual(priceText(cents: 1250), "$12.50")
    }

    func testCentsOnlyStillShowsADollarSign() {
        XCTAssertEqual(priceText(cents: 5), "$0.05")
    }
}
