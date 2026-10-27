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

/// What to add to end at par, floored at zero. `nil` when the slot has no par:
/// no target and an already-full slot are different facts, so the field stays
/// empty rather than defaulting to nothing-to-add.
///
/// Takes back whatever was pulled. `levelAfter` is `remaining − removed +
/// added`, so ignoring `removed` sends the machine back short by exactly the
/// number removed — behind a default that looked right.
func unitsToFillPar(remaining: Int, removed: Int, par: Int?) -> Int? {
    guard let par else { return nil }
    return max(0, par - remaining + removed)
}

/// You cannot pull more than you found. The server bounds `removed` only by
/// `0...999`, so an unchecked entry books a level the slot never held.
func cappedRemoval(of units: Int, foundInSlot remaining: Int) -> Int {
    min(max(0, units), max(0, remaining))
}

/// Why units left a slot without being sold.
///
/// Mirrors `packages/domain/src/visits/removals.ts`, including its wire values
/// — the server's enum accepts exactly these five.
nonisolated enum RemovalReason: String, CaseIterable, Sendable {
    /// Past date, binned.
    case expired
    /// Crushed, leaking, binned.
    case damaged
    /// Manufacturer recall, binned.
    case recalled
    /// Slow mover pulled back to the van to sell elsewhere.
    case destocked
    /// Moved straight into another machine.
    case transferred
}

/// What a reason means to the money. The one place the loss-vs-transfer policy
/// lives on this side, matching `dispositionFor` on the server.
nonisolated enum RemovalDisposition: Sendable {
    /// The units are gone. You paid for them and nobody ever will.
    case writtenOff
    /// Still your inventory — their cost lands wherever they finally sell, so
    /// charging it here would double-count.
    case returnedToStock
}

extension RemovalReason {
    var disposition: RemovalDisposition {
        switch self {
        case .expired, .damaged, .recalled: .writtenOff
        case .destocked, .transferred: .returnedToStock
        }
    }

    /// What the operator is actually deciding between, which is not five words
    /// but two outcomes.
    var headline: String {
        switch disposition {
        case .writtenOff: "Written off — you paid, nobody will"
        case .returnedToStock: "Back to the van — still your stock"
        }
    }

    var label: String {
        rawValue.prefix(1).uppercased() + rawValue.dropFirst()
    }
}

extension DraftLine {
    /// The countable identity. Slot AND product, because a mixed spiral holds
    /// two products in one slot and each is counted separately.
    var slotKey: SlotKey {
        SlotKey(slotCode: slotCode, productId: productId)
    }

    /// Counted means `remaining` was typed. A missing count is not a zero.
    var isCounted: Bool {
        remaining != nil
    }

    /// The ADDING field's subtitle: the par target, and whether the fill meets
    /// it. "Short" is the capture spec's word for a fill below par — the same
    /// vocabulary as `MachineTriage.shortFillText`, defined in one place.
    var fillText: String? {
        guard let par else { return nil }
        guard let remaining else { return "par \(par)" }

        let toPar = unitsToFillPar(remaining: remaining, removed: removed, par: par) ?? 0
        return added == toPar
            ? "fills to par \(par)"
            : "\(added ?? 0) of par \(par) — short"
    }
}
