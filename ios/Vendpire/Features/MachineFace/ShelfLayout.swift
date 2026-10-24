import CoreGraphics

/// Shelf geometry for the machine face.
///
/// Every shelf spans the full width and cell width falls out of the slot
/// count, so a 4-slot shelf shows four wide cells and a 7-slot shelf seven
/// narrow ones — the way a cabinet is actually built. Mirrors the rule in
/// packages/web/src/ui/SlotFaceGrid.tsx.
enum ShelfLayout {
    static let cellSpacing: CGFloat = 8
    static let shelfSpacing: CGFloat = 8
    static let padding: CGFloat = 16
    static let cellHeight: CGFloat = 56

    /// Past this the row overflows and scrolls rather than crushing cells into
    /// slivers. The web's equivalent floor is 56px, tuned for browser type;
    /// `$1.25` at caption2 is ~29pt, so iOS can go narrower and still fit
    /// `National 148`'s 7-wide shelves without scrolling.
    static let minCellWidth: CGFloat = 40

    static func cellWidth(slotCount: Int, availableWidth: CGFloat) -> CGFloat {
        guard slotCount > 0 else { return minCellWidth }
        let gaps = CGFloat(slotCount - 1) * cellSpacing
        let usable = availableWidth - padding * 2 - gaps
        return max(minCellWidth, usable / CGFloat(slotCount))
    }

    static func rowWidth(slotCount: Int, availableWidth: CGFloat) -> CGFloat {
        guard slotCount > 0 else { return 0 }
        let cell = cellWidth(slotCount: slotCount, availableWidth: availableWidth)
        return cell * CGFloat(slotCount) + CGFloat(slotCount - 1) * cellSpacing
    }
}
