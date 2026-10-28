import XCTest

@testable import Vendpire

/// Mirrors packages/domain/src/visits/sold.ts. Same arithmetic, same name — the
/// two drift the moment either side gets clever.
final class VisitLevelsTests: XCTestCase {
    func testLevelAfterIsWhatWasLeftInTheSlot() {
        let line = VisitLine(
            slotCode: "A0",
            productId: "product-1",
            remaining: 2,
            added: 8,
            removed: 1
        )

        XCTAssertEqual(line.levelAfter, 9)
    }

    func testAnUntouchedSlotKeepsItsRemainingCount() {
        let line = VisitLine(
            slotCode: "B2",
            productId: "product-2",
            remaining: 5,
            added: 0,
            removed: 0
        )

        XCTAssertEqual(line.levelAfter, 5)
    }

    func testEverythingRemovedLeavesNothing() {
        let line = VisitLine(
            slotCode: "C4",
            productId: "product-3",
            remaining: 3,
            added: 0,
            removed: 3
        )

        XCTAssertEqual(line.levelAfter, 0)
    }

    func testADraftLineBooksTheSameLevelItsSubmittedTwinWill() {
        let draft = DraftLine(
            slotCode: "A0", productId: "p-1", remaining: 2, added: 8,
            removed: 1, removedReason: "expired", priceCents: 175, par: 10, bestBy: nil
        )

        XCTAssertEqual(draft.levelAfter, 9, "remaining − removed + added, the P&L's formula")
    }

    func testAnUncountedDraftLineHasNoLevel() {
        let draft = DraftLine(
            slotCode: "A0", productId: "p-1", remaining: nil, added: nil,
            removed: 0, removedReason: nil, priceCents: 175, par: 10, bestBy: nil
        )

        XCTAssertNil(draft.levelAfter, "a missing count is not a zero, so there is no level")
    }
}
