import XCTest

@testable import Vendpire

/// Shelf geometry. Every shelf spans the same total width and the cell width
/// falls out of the slot count, so the face reads as one cabinet rather than
/// as rows that happen to sit above each other.
final class ShelfLayoutTests: XCTestCase {
    /// What a shelf's cells span in total. Lives here, not in ShelfLayout:
    /// its only production caller was the deleted read-only face, but the
    /// properties it expresses — National 148 fitting without a scroll, a
    /// 10-wide shelf overflowing instead of crushing — are the sizing rules
    /// that failed on a device and must stay pinned.
    private func rowWidth(slotCount: Int, availableWidth: CGFloat) -> CGFloat {
        guard slotCount > 0 else { return 0 }
        let cell = ShelfLayout.cellWidth(slotCount: slotCount, availableWidth: availableWidth)
        return cell * CGFloat(slotCount) + CGFloat(slotCount - 1) * ShelfLayout.cellSpacing
    }

    /// An iPhone 17 Pro, which is what `National 148` has to fit on.
    private let screen: CGFloat = 393

    func testAFourSlotShelfGetsWiderCellsThanASevenSlotShelf() {
        let four = ShelfLayout.cellWidth(slotCount: 4, availableWidth: screen)
        let seven = ShelfLayout.cellWidth(slotCount: 7, availableWidth: screen)

        XCTAssertEqual(four, 84.25, accuracy: 0.01)
        XCTAssertEqual(seven, 44.71, accuracy: 0.01)
        XCTAssertGreaterThan(four, seven)
    }

    /// The whole point: ragged shelves still line up as a rectangle.
    func testEveryShelfOnNational148SpansTheSameWidth() {
        let widths = [4, 4, 4, 7, 7, 4].map { slotCount in
            rowWidth(slotCount: slotCount, availableWidth: screen)
        }

        for width in widths {
            XCTAssertEqual(width, widths[0], accuracy: 0.01)
        }
    }

    func testNational148NeedsNoHorizontalScrolling() {
        let widest = rowWidth(slotCount: 7, availableWidth: screen)

        XCTAssertLessThanOrEqual(widest, screen)
    }

    /// Past the floor the row overflows and scrolls, rather than crushing
    /// cells into unreadable slivers. Same rule as the web's `min-w-14`.
    func testAnUnusuallyWideShelfHitsTheFloorInsteadOfShrinking() {
        let cell = ShelfLayout.cellWidth(slotCount: 10, availableWidth: screen)

        XCTAssertEqual(cell, ShelfLayout.minCellWidth)
        XCTAssertGreaterThan(rowWidth(slotCount: 10, availableWidth: screen), screen)
    }

    func testTheControlMachineSpansTheWidthWithTwoWideCells() {
        let cell = ShelfLayout.cellWidth(slotCount: 2, availableWidth: screen)

        XCTAssertEqual(cell, 176.5, accuracy: 0.01)
    }

    /// A shelf authored with no slots must not divide by zero.
    func testAnEmptyShelfDoesNotTrap() {
        XCTAssertEqual(ShelfLayout.cellWidth(slotCount: 0, availableWidth: screen), ShelfLayout.minCellWidth)
    }
}
