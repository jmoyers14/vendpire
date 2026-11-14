import Foundation

/// Pure arithmetic over visit lines. No SwiftData, no simulator, no fixture —
/// which is the whole reason `Domain/` exists. See ARCHITECTURE.md.

extension VisitLine {
    /// What was left in the slot when the operator walked away.
    ///
    /// Named to match `levelAfter` in packages/domain/src/visits/sold.ts, which
    /// is the same arithmetic the server's P&L runs on.
    var levelAfter: Int { remaining + added - removed }
}

extension DraftLine {
    /// The level this line will book once submitted — the draft-side twin of
    /// `VisitLine.levelAfter`, nil until the slot is counted. One home for the
    /// formula, so the review's preview can never diverge from what the P&L
    /// computes after submit.
    var levelAfter: Int? {
        remaining.map { $0 - removed + (added ?? 0) }
    }
}

/// The one spelling of the phrase, shared by the strip's subtitle and Review's
/// gap rows — the same defined-in-one-place rule as `fillText`'s "short".
func lastLevelText(_ level: Int) -> String {
    "left \(level) last time"
}
