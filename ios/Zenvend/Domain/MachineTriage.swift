import Foundation

/// What a machine list row needs to decide whether a machine is worth opening.
///
/// Two facts, never a verdict. What we left is only meaningful beside how long
/// it has been, and the operator combines them — the phone cannot estimate
/// current stock, because that needs sales and only the server computes those.
nonisolated struct MachineTriage: Equatable, Sendable {
    /// Whole elapsed days, not calendar days: for staleness, "two hours ago"
    /// should read as today even across midnight. Clamped at zero so clock
    /// skew cannot produce a negative age.
    let daysSinceService: Int?

    /// What we walked away leaving behind, matching `VisitLine.levelAfter`.
    let unitsLeft: Int?

    /// Σ par across the current planogram. `nil` with no planogram, so the row
    /// reads `left 61` rather than `left 61 of 0`.
    let capacity: Int?

    /// Planogram slots we left below par — a short fill, in the capture spec's
    /// vocabulary, because the operator ran out of stock rather than chose to
    /// under-fill.
    ///
    /// Excludes slots the last visit did not count. Trap 3 means an uncounted
    /// slot emits no line at all, so we do not know what is in it, and unknown
    /// is not short.
    let slotsShort: Int

    init(countedAt: Date?, lines: [VisitLine], planogramSlots: [PlanogramSlot], asOf now: Date) {
        if let countedAt {
            daysSinceService = max(0, Int(now.timeIntervalSince(countedAt) / 86_400))
            unitsLeft = lines.reduce(0) { $0 + $1.levelAfter }
        } else {
            daysSinceService = nil
            unitsLeft = nil
        }

        capacity = planogramSlots.isEmpty
            ? nil
            : planogramSlots.reduce(0) { $0 + $1.par }

        // Uniquing rather than `uniqueKeysWithValues`: a duplicate slot code is
        // a layout someone authored, not a crash.
        let leftBySlot = Dictionary(lines.map { ($0.slotCode, $0.levelAfter) }) { first, _ in first }
        slotsShort = planogramSlots.filter { slot in
            guard let left = leftBySlot[slot.slotCode] else { return false }
            return left < slot.par
        }.count
    }
}

extension MachineTriage {
    /// Always shown. The only fact here that varies on a healthy route.
    var ageText: String {
        guard let days = daysSinceService else { return "never serviced" }

        switch days {
        case 0: return "today"
        case 1: return "1 day"
        default: return "\(days) days"
        }
    }

    /// `nil` unless the fill came up short, which is the only time stock is
    /// worth words. A visit fills to par, so a machine left full is the normal
    /// case — saying "left 170 of 170" on every row would print a constant.
    var shortFillText: String? {
        guard slotsShort > 0, let unitsLeft else { return nil }

        let slots = slotsShort == 1 ? "1 slot short" : "\(slotsShort) slots short"
        guard let capacity else { return slots }
        return "left \(unitsLeft) of \(capacity) · \(slots)"
    }
}
