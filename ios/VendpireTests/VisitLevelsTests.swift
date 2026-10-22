import XCTest

@testable import Vendpire

/// Mirrors packages/domain/src/visits/sold.ts. Same arithmetic, same name — the
/// two drift the moment either side gets clever.
final class VisitLevelsTests: XCTestCase {
    func testLevelAfterIsWhatWasLeftInTheSlot() {
        let line = VisitLineSnapshot(
            slotCode: "A0",
            productId: "product-1",
            remaining: 2,
            added: 8,
            removed: 1
        )

        XCTAssertEqual(line.levelAfter, 9)
    }

    func testAnUntouchedSlotKeepsItsRemainingCount() {
        let line = VisitLineSnapshot(
            slotCode: "B2",
            productId: "product-2",
            remaining: 5,
            added: 0,
            removed: 0
        )

        XCTAssertEqual(line.levelAfter, 5)
    }

    func testEverythingRemovedLeavesNothing() {
        let line = VisitLineSnapshot(
            slotCode: "C4",
            productId: "product-3",
            remaining: 3,
            added: 0,
            removed: 3
        )

        XCTAssertEqual(line.levelAfter, 0)
    }
}
