import XCTest

@testable import Vendpire

/// Money is `Int` cents everywhere else in the app. `Money` is the only place
/// it crosses a text boundary, ported from `packages/web/src/utils/money.ts`.
/// Cases below are the web test suite's own, so the two stay in lockstep.
final class MoneyTests: XCTestCase {
    // MARK: - formatCents

    func testWholeDollarsKeepTwoDecimalPlaces() {
        XCTAssertEqual(Money.formatCents(200), "$2.00")
    }

    func testCentsBelowTenAreZeroPadded() {
        XCTAssertEqual(Money.formatCents(205), "$2.05")
    }

    func testATypicalPriceFormats() {
        XCTAssertEqual(Money.formatCents(175), "$1.75")
    }

    func testFreeIsZeroNotBlank() {
        XCTAssertEqual(Money.formatCents(0), "$0.00")
    }

    func testPricesAboveTenDollarsDoNotLoseDigits() {
        XCTAssertEqual(Money.formatCents(1250), "$12.50")
    }

    func testCentsOnlyStillShowsADollarSign() {
        XCTAssertEqual(Money.formatCents(5), "$0.05")
    }

    func testThousandsAreGrouped() {
        XCTAssertEqual(Money.formatCents(123_456), "$1,234.56")
    }

    // MARK: - parseDollarsToCents

    func testParsesADollarsStringToIntegerCents() {
        XCTAssertEqual(Money.parseDollarsToCents("1.75"), 175)
        XCTAssertEqual(Money.parseDollarsToCents("0"), 0)
        XCTAssertEqual(Money.parseDollarsToCents("13"), 1300)
    }

    func testALeadingDecimalPointIsAccepted() {
        XCTAssertEqual(Money.parseDollarsToCents(".5"), 50)
    }

    func testRoundsSubCentInputToTheNearestCent() {
        XCTAssertEqual(Money.parseDollarsToCents("1.004"), 100)
        XCTAssertEqual(Money.parseDollarsToCents("1.006"), 101)
    }

    func testRejectsBlanksWordsAndNegatives() {
        XCTAssertNil(Money.parseDollarsToCents(""))
        XCTAssertNil(Money.parseDollarsToCents("free"))
        XCTAssertNil(Money.parseDollarsToCents("-1"))
    }

    /// `Number.parseFloat("12.999")` is 12.999, not NaN — it reads the longest
    /// numeric prefix and keeps going past the third decimal. This pins the
    /// web's actual behavior (packages/web/src/utils/money.ts).
    func testASubCentThirdDigitRoundsRatherThanRejects() {
        XCTAssertEqual(Money.parseDollarsToCents("12.999"), 1300)
    }

    /// `Number.parseFloat("$12.99")` is NaN — `$` isn't part of a numeric
    /// prefix, so the web's `parseDollarsToCents` rejects it too. This pins
    /// the web's actual behavior (packages/web/src/utils/money.ts).
    func testADollarSignIsNotStrippedAndSoFailsToParse() {
        XCTAssertNil(Money.parseDollarsToCents("$12.99"))
    }

    func testRoundTripsThroughFormatCentsInput() {
        for cents in [0, 1, 99, 175, 2000, 123_456] {
            XCTAssertEqual(Money.parseDollarsToCents(String(Double(cents) / 100)), cents)
        }
    }
}
