import Foundation

/// One countable thing on the face.
///
/// Keyed on the product as well as the slot: a mixed spiral holds two products
/// in one slot and each is counted separately.
nonisolated struct SlotKey: Hashable, Sendable {
    let slotCode: String
    let productId: String
}

/// Where `Next` goes, and therefore what it reads.
///
/// `.gap` is distinct from `.slot` because the key relabels when it starts
/// hunting — the one place it changes meaning says so on its face.
nonisolated enum NextDestination: Equatable, Sendable {
    case slot(SlotKey)
    case gap(SlotKey)
    case review
}

/// The order `Next` walks: `machine.slots` flattened shelf by shelf, exactly as
/// authored. Never inferred from the codes.
nonisolated struct CaptureOrder: Equatable, Sendable {
    let keys: [SlotKey]

    init(keys: [SlotKey]) {
        self.keys = keys
    }

    /// Un-planogrammed cells are skipped: an empty slot holds no product to
    /// count, even though the grid still draws it.
    init(slots: [[String]], planogramSlots: [PlanogramSlot]) {
        let productBySlot = Dictionary(
            planogramSlots.map { ($0.slotCode, $0.productId) }
        ) { first, _ in first }

        keys = slots.flatMap { $0 }.compactMap { slotCode in
            productBySlot[slotCode].map { SlotKey(slotCode: slotCode, productId: $0) }
        }
    }

    /// The key beside this one; `nil` at the end of the face.
    func slotAfter(_ key: SlotKey) -> SlotKey? {
        guard let index = keys.firstIndex(of: key), index + 1 < keys.count else { return nil }
        return keys[index + 1]
    }

    /// A mixed spiral: the incoming product lands directly after the outgoing
    /// one rather than at the end of the face.
    func inserting(_ key: SlotKey, after sibling: SlotKey) -> CaptureOrder {
        guard let index = keys.firstIndex(of: sibling) else { return self }

        var widened = keys
        widened.insert(key, at: index + 1)
        return CaptureOrder(keys: widened)
    }
}

/// Where focus is, and what `Next` therefore does.
nonisolated struct CaptureCursor: Equatable, Sendable {
    let order: CaptureOrder
    let counted: Set<SlotKey>
    let focus: SlotKey

    /// O(n) in the number of slots.
    var firstUncountedSlot: SlotKey? {
        order.keys.first { !counted.contains($0) }
    }

    /// Linear, always. Targeting the next *uncounted* slot would make the key
    /// teleport whenever you went back to correct something — which happens on
    /// most visits, because you learn you are short after moving on.
    var nextDestination: NextDestination {
        if let neighbour = order.slotAfter(focus) {
            return .slot(neighbour)
        }
        if let gap = firstUncountedSlot {
            return .gap(gap)
        }
        return .review
    }
}

/// `par − remaining`, floored at zero. `nil` when the slot has no par: no
/// target and an already-full slot are different facts, so the field stays
/// empty rather than defaulting to nothing-to-add.
func unitsToFillPar(remaining: Int, par: Int?) -> Int? {
    guard let par else { return nil }
    return max(0, par - remaining)
}
