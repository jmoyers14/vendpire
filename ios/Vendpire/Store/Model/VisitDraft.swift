import Foundation
import SwiftData

/// A visit being counted, or counted and waiting to sync.
///
/// Carries no status of its own. Its existence, joined against `OutboxItem` on
/// the request id, is the state: a draft alone is open, a draft beside a queue
/// row is waiting to sync, and both are deleted together once the server
/// confirms the visit. Storing that fact twice would let the two disagree.
///
/// `#Unique` is on `clientRequestId`, not `machineId`. One *open* draft per
/// machine is the rule, but a submitted-but-undrained draft must not block a
/// new one — an operator can service the same machine twice before finding
/// signal. That distinction is a service rule; the schema cannot express it.
@Model
final class VisitDraft {
    #Unique<VisitDraft>([\.clientRequestId])

    var clientRequestId: String = ""
    var machineId: String = ""
    /// Snapshot, not a lookup: the machine may be moved between counting and
    /// syncing, and the visit belongs where it was counted.
    var locationId: String = ""
    var planogramId: String?
    /// Stamped at Start visit — when the observations were made, which is what
    /// the drain orders by and what the server checks for out-of-order.
    var countedAt: Date = Date.distantPast
    var notes: String?
    var lines: [DraftLine] = []

    init(
        clientRequestId: String,
        machineId: String,
        locationId: String,
        planogramId: String?,
        countedAt: Date,
        notes: String? = nil,
        lines: [DraftLine] = []
    ) {
        self.clientRequestId = clientRequestId
        self.machineId = machineId
        self.locationId = locationId
        self.planogramId = planogramId
        self.countedAt = countedAt
        self.notes = notes
        self.lines = lines
    }
}

/// One slot mid-count.
///
/// `remaining` is `nil` until someone counts it, and that nil is load-bearing
/// — see `makeSubmission`. `priceCents` and `par` are snapshotted from the
/// planogram at Start visit so a reprice mid-route cannot rewrite what was
/// actually charged.
nonisolated struct DraftLine: Codable, Equatable, Hashable, Sendable {
    var slotCode: String
    var productId: String
    var remaining: Int?
    var added: Int?
    var removed: Int
    var removedReason: String?
    var priceCents: Int
    var par: Int?
    var bestBy: String?
}

extension VisitDraft {
    /// The payload, or `nil` when nothing was counted.
    ///
    /// **A slot with no `remaining` emits no line.** Trap 3 in the plan of
    /// record: treating an uncounted slot as `remaining = 0` books the entire
    /// leftover as sold and invents revenue. The server cannot detect it, the
    /// P&L cannot detect it, and the operator has already left the building.
    ///
    /// `nil` rather than an empty submission because the server rejects an
    /// empty `lines`, and finding that out after a drain means telling someone
    /// hours after they could have done anything about it.
    func makeSubmission() -> VisitSubmission? {
        let counted = lines.compactMap { line -> VisitSubmissionLine? in
            guard let remaining = line.remaining else { return nil }
            return VisitSubmissionLine(
                slotCode: line.slotCode,
                productId: line.productId,
                remaining: remaining,
                // Counted the slot and put nothing in it: a real observation.
                added: line.added ?? 0,
                removed: line.removed,
                removedReason: line.removedReason,
                priceCents: line.priceCents,
                par: line.par,
                bestBy: line.bestBy
            )
        }
        guard !counted.isEmpty else { return nil }

        return VisitSubmission(
            machineId: machineId,
            locationId: locationId,
            planogramId: planogramId,
            countedAt: countedAt,
            lines: counted,
            notes: notes,
            clientRequestId: clientRequestId
        )
    }
}
