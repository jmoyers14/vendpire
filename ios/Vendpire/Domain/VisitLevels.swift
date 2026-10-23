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
