import Foundation

/// What the Review screen says before Submit. Pure values in, pure values out.
///
/// Review is a gate to be read, not a blocker: every section here is warn-only
/// and everything records exactly as entered. The one rule with teeth lives
/// upstream — a draft with nothing counted cannot submit at all.
nonisolated struct VisitReviewSummary: Equatable, Sendable {
    /// An uncounted slot. Not a zero — it will have no sales figure for this
    /// interval, and the row carries what we left there so the operator can
    /// judge whether it is worth walking back for.
    struct Gap: Equatable, Sendable {
        let slotCode: String
        let productId: String
        let lastLevel: Int?
    }

    /// More counted than the slot could have held: last time we left
    /// `lastLevel`, this visit found `remaining`. Warn-only — negative sold is
    /// legal and the engine never clamps — but a recount now beats a report
    /// next week.
    struct SuspiciousCount: Equatable, Sendable {
        let slotCode: String
        let productId: String
        let remaining: Int
        let lastLevel: Int
    }

    /// The slot will physically hold more than its fill target.
    struct OverParFill: Equatable, Sendable {
        let slotCode: String
        let productId: String
        let levelAfter: Int
        let par: Int
    }

    struct PulledStock: Equatable, Sendable {
        let slotCode: String
        let productId: String
        let units: Int
        let reason: RemovalReason?
    }

    let gaps: [Gap]
    let suspiciousCounts: [SuspiciousCount]
    let overParFills: [OverParFill]
    let pulled: [PulledStock]
    let countedCount: Int
    let totalCount: Int

    /// `lastLevels` is what the previous visit left per key — `levelAfter` of
    /// its lines. A key with no entry has no baseline and warns about nothing.
    init(lines: [DraftLine], lastLevels: [SlotKey: Int]) {
        var gaps: [Gap] = []
        var suspicious: [SuspiciousCount] = []
        var overPar: [OverParFill] = []
        var pulled: [PulledStock] = []
        var counted = 0

        for line in lines {
            let lastLevel = lastLevels[line.slotKey]

            guard let remaining = line.remaining else {
                gaps.append(
                    Gap(slotCode: line.slotCode, productId: line.productId, lastLevel: lastLevel)
                )
                continue
            }
            counted += 1

            if let lastLevel, remaining > lastLevel {
                suspicious.append(
                    SuspiciousCount(
                        slotCode: line.slotCode, productId: line.productId,
                        remaining: remaining, lastLevel: lastLevel
                    )
                )
            }

            let levelAfter = remaining - line.removed + (line.added ?? 0)
            if let par = line.par, levelAfter > par {
                overPar.append(
                    OverParFill(
                        slotCode: line.slotCode, productId: line.productId,
                        levelAfter: levelAfter, par: par
                    )
                )
            }

            if line.removed > 0 {
                pulled.append(
                    PulledStock(
                        slotCode: line.slotCode, productId: line.productId,
                        units: line.removed, reason: line.removalReason
                    )
                )
            }
        }

        self.gaps = gaps
        self.suspiciousCounts = suspicious
        self.overParFills = overPar
        self.pulled = pulled
        self.countedCount = counted
        self.totalCount = lines.count
    }
}
