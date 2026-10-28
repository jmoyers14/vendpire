import XCTest

@testable import Vendpire

/// What the Review screen says before Submit. Pure values in, pure values out.
///
/// Review is the gate, not a blocker: everything records exactly as entered,
/// and these sections exist to be *seen*, not to stop a submit. The one rule
/// with teeth is upstream — a draft with nothing counted cannot submit at all.
final class VisitReviewTests: XCTestCase {
    private func line(
        _ slotCode: String,
        remaining: Int? = nil,
        added: Int? = nil,
        removed: Int = 0,
        removedReason: String? = nil,
        par: Int? = 10
    ) -> DraftLine {
        DraftLine(
            slotCode: slotCode, productId: "p-\(slotCode)",
            remaining: remaining, added: added,
            removed: removed, removedReason: removedReason,
            priceCents: 175, par: par, bestBy: nil
        )
    }

    private func lastLevels(_ pairs: [String: Int]) -> [SlotKey: Int] {
        Dictionary(uniqueKeysWithValues: pairs.map { (SlotKey(slotCode: $0, productId: "p-\($0)"), $1) })
    }

    // MARK: - Gaps

    func testGapsAreTheUncountedLinesInCaptureOrder() {
        let summary = VisitReviewSummary(
            lines: [line("A4"), line("A0", remaining: 3, added: 7), line("A2")],
            lastLevels: [:]
        )

        XCTAssertEqual(summary.gaps.map(\.slotCode), ["A4", "A2"])
    }

    /// The row shows what the slot held when we left — the number that tells
    /// an operator whether this gap is worth walking back for.
    func testAGapCarriesWhatWeLeftThereLastTime() {
        let summary = VisitReviewSummary(
            lines: [line("A0")],
            lastLevels: lastLevels(["A0": 6])
        )

        XCTAssertEqual(summary.gaps.first?.lastLevel, 6)
    }

    func testAGapOnANeverCountedSlotHasNoLastLevel() {
        let summary = VisitReviewSummary(lines: [line("A0")], lastLevels: [:])

        XCTAssertNil(summary.gaps.first?.lastLevel)
    }

    // MARK: - Suspicious counts

    /// More found than could have been there: last time we left 7, now 9 are
    /// counted. Warn-only — negative sold is legal and the engine never clamps
    /// — but catching it at the machine beats a report next week.
    func testCountingMoreThanWeLeftIsSuspicious() {
        let summary = VisitReviewSummary(
            lines: [line("A0", remaining: 9, added: 1)],
            lastLevels: lastLevels(["A0": 7])
        )

        XCTAssertEqual(summary.suspiciousCounts.map(\.slotCode), ["A0"])
        XCTAssertEqual(summary.suspiciousCounts.first?.lastLevel, 7)
    }

    func testCountingExactlyWhatWeLeftIsNotSuspicious() {
        let summary = VisitReviewSummary(
            lines: [line("A0", remaining: 7, added: 3)],
            lastLevels: lastLevels(["A0": 7])
        )

        XCTAssertTrue(summary.suspiciousCounts.isEmpty)
    }

    /// No baseline, no comparison. A first visit is not suspicious.
    func testASlotWithNoHistoryIsNeverSuspicious() {
        let summary = VisitReviewSummary(
            lines: [line("A0", remaining: 99, added: 0)],
            lastLevels: [:]
        )

        XCTAssertTrue(summary.suspiciousCounts.isEmpty)
    }

    // MARK: - Over-par fills

    /// levelAfter beyond par: the slot physically holds more than its target.
    func testFillingPastParIsFlagged() {
        let summary = VisitReviewSummary(
            lines: [line("A0", remaining: 4, added: 9)],
            lastLevels: [:]
        )

        XCTAssertEqual(summary.overParFills.map(\.slotCode), ["A0"])
    }

    func testFillingExactlyToParIsNot() {
        let summary = VisitReviewSummary(
            lines: [line("A0", remaining: 4, added: 6)],
            lastLevels: [:]
        )

        XCTAssertTrue(summary.overParFills.isEmpty)
    }

    func testASlotWithNoParCannotBeOverIt() {
        let summary = VisitReviewSummary(
            lines: [line("A0", remaining: 4, added: 20, par: nil)],
            lastLevels: [:]
        )

        XCTAssertTrue(summary.overParFills.isEmpty)
    }

    // MARK: - Pulled stock

    func testPulledStockListsEachRemovalWithItsReason() {
        let summary = VisitReviewSummary(
            lines: [
                line("A0", remaining: 5, added: 7, removed: 2, removedReason: "expired"),
                line("A2", remaining: 3, added: 7),
            ],
            lastLevels: [:]
        )

        XCTAssertEqual(summary.pulled.map(\.slotCode), ["A0"])
        XCTAssertEqual(summary.pulled.first?.units, 2)
        XCTAssertEqual(summary.pulled.first?.reason, .expired)
    }

    // MARK: - The counts the header reads

    func testTheSummaryCountsCountedAgainstTotal() {
        let summary = VisitReviewSummary(
            lines: [line("A0", remaining: 1, added: 9), line("A2"), line("A4")],
            lastLevels: [:]
        )

        XCTAssertEqual(summary.countedCount, 1)
        XCTAssertEqual(summary.totalCount, 3)
    }
}
