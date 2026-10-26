import XCTest

@testable import Vendpire

/// What a list row needs to decide whether a machine is worth opening. Two
/// facts, never a verdict — the operator combines them.
final class MachineTriageTests: XCTestCase {
    private let now = Date(timeIntervalSince1970: 1_800_000_000)

    private func daysAgo(_ days: Int) -> Date {
        now.addingTimeInterval(-Double(days) * 86_400)
    }

    private func line(_ slotCode: String, remaining: Int, added: Int, removed: Int = 0) -> VisitLine {
        VisitLine(
            slotCode: slotCode,
            productId: "p-\(slotCode)",
            remaining: remaining,
            added: added,
            removed: removed
        )
    }

    private func slot(_ slotCode: String, par: Int) -> PlanogramSlot {
        PlanogramSlot(slotCode: slotCode, productId: "p-\(slotCode)", par: par, priceCents: 100)
    }

    private func triage(
        countedAt: Date?,
        lines: [VisitLine] = [],
        slots: [PlanogramSlot] = []
    ) -> MachineTriage {
        MachineTriage(countedAt: countedAt, lines: lines, planogramSlots: slots, asOf: now)
    }

    // MARK: - What the row reads

    func testNeverServicedSaysSoRatherThanShowingANumber() {
        XCTAssertEqual(triage(countedAt: nil).ageText, "never serviced")
    }

    func testTodayReadsAsTodayRatherThanZeroDays() {
        XCTAssertEqual(triage(countedAt: now.addingTimeInterval(-3600)).ageText, "today")
    }

    func testOneDayIsSingular() {
        XCTAssertEqual(triage(countedAt: daysAgo(1)).ageText, "1 day")
    }

    func testOlderAgesAreCountedInDays() {
        XCTAssertEqual(triage(countedAt: daysAgo(18)).ageText, "18 days")
    }

    /// A visit fills to par, so a machine left full is the normal case and the
    /// row says nothing about stock. This is the suppression that stopped the
    /// row reading "left 170 of 170" on every machine forever.
    func testAMachineLeftFullSaysNothingAboutStock() {
        let result = triage(
            countedAt: daysAgo(18),
            lines: [line("A0", remaining: 0, added: 10)],
            slots: [slot("A0", par: 10)]
        )

        XCTAssertNil(result.shortFillText)
    }

    /// The one case worth words: the van ran out before the machine was full.
    func testAShortFillNamesWhatWasLeftAndHowManySlots() {
        let result = triage(
            countedAt: daysAgo(8),
            lines: [line("A0", remaining: 0, added: 4), line("A2", remaining: 0, added: 10)],
            slots: [slot("A0", par: 10), slot("A2", par: 10)]
        )

        XCTAssertEqual(result.shortFillText, "left 14 of 20 · 1 slot short")
    }

    func testSeveralShortSlotsArePlural() {
        let result = triage(
            countedAt: daysAgo(8),
            lines: [line("A0", remaining: 0, added: 4), line("A2", remaining: 0, added: 6)],
            slots: [slot("A0", par: 10), slot("A2", par: 10)]
        )

        XCTAssertEqual(result.shortFillText, "left 10 of 20 · 2 slots short")
    }

    // MARK: - The facts behind it

    func testAMachineNeverServicedHasNoAgeAndNoCount() {
        let result = triage(countedAt: nil, slots: [slot("A0", par: 10)])

        XCTAssertNil(result.daysSinceService)
        XCTAssertNil(result.unitsLeft)
    }

    func testAgeIsCountedInWholeDays() {
        XCTAssertEqual(triage(countedAt: daysAgo(12)).daysSinceService, 12)
    }

    /// Serviced this morning is not "0 days ago" to a person, but the Domain
    /// reports the number and the row does the wording.
    func testServicedTodayIsZeroDays() {
        XCTAssertEqual(triage(countedAt: now.addingTimeInterval(-3600)).daysSinceService, 0)
    }

    /// Matches `VisitLine.levelAfter` — what we walked away leaving behind.
    func testUnitsLeftIsWhatWeLeftBehind() {
        let result = triage(
            countedAt: daysAgo(1),
            lines: [line("A0", remaining: 3, added: 7), line("A2", remaining: 2, added: 8, removed: 1)]
        )

        XCTAssertEqual(result.unitsLeft, 19)
    }

    func testCapacityIsTheSumOfPars() {
        let result = triage(
            countedAt: daysAgo(1),
            lines: [line("A0", remaining: 0, added: 10)],
            slots: [slot("A0", par: 10), slot("A2", par: 8)]
        )

        XCTAssertEqual(result.capacity, 18)
    }

    /// No planogram means no denominator. The row reads "left 61", not
    /// "left 61 of 0".
    func testAMachineWithNoPlanogramHasNoCapacity() {
        let result = triage(countedAt: daysAgo(1), lines: [line("A0", remaining: 4, added: 0)])

        XCTAssertNil(result.capacity)
        XCTAssertEqual(result.unitsLeft, 4)
    }

    func testASlotLeftBelowParIsShort() {
        let result = triage(
            countedAt: daysAgo(1),
            lines: [line("A0", remaining: 0, added: 4)],
            slots: [slot("A0", par: 10)]
        )

        XCTAssertEqual(result.slotsShort, 1)
    }

    func testASlotLeftAtParIsNotShort() {
        let result = triage(
            countedAt: daysAgo(1),
            lines: [line("A0", remaining: 0, added: 10)],
            slots: [slot("A0", par: 10)]
        )

        XCTAssertEqual(result.slotsShort, 0)
    }

    /// Last visit's lines only cover slots that were counted — trap 3 means an
    /// uncounted slot emits no line. We do not know what we left there, and
    /// unknown is not short.
    func testAnUncountedSlotIsNotCountedAsShort() {
        let result = triage(
            countedAt: daysAgo(1),
            lines: [line("A0", remaining: 0, added: 10)],
            slots: [slot("A0", par: 10), slot("A2", par: 10)]
        )

        XCTAssertEqual(result.slotsShort, 0)
    }

    /// Every planogram slot carries a par — the server marks it required — so
    /// there is no missing-par case. A par of zero needs no special handling.
    func testAParOfZeroIsNeverShort() {
        let result = triage(
            countedAt: daysAgo(1),
            lines: [line("A0", remaining: 0, added: 0)],
            slots: [slot("A0", par: 0)]
        )

        XCTAssertEqual(result.capacity, 0)
        XCTAssertEqual(result.slotsShort, 0)
    }
}
