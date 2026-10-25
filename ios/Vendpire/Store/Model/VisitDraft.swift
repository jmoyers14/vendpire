import Foundation
import SwiftData

/// A visit being counted, or counted and waiting to sync.
///
/// No status field: a draft alone is open, a draft beside an `OutboxItem` is
/// waiting, and both are deleted on success. Storing that twice would let the
/// two disagree.
///
/// `#Unique` is on the request id, not `machineId` — an operator can service
/// one machine twice before finding signal, so "one open draft per machine"
/// is a service rule the schema cannot express.
@Model
final class VisitDraft {
    #Unique<VisitDraft>([\.clientRequestId])

    /// No property default. An empty `#Unique` field would let two id-less
    /// drafts collide into one row — silent loss of a day's counts.
    var clientRequestId: String
    var machineId: String = ""
    /// Snapshot: the machine may be moved between counting and syncing.
    var locationId: String = ""
    var planogramId: String?
    /// Stamped at Start visit. Drain order, and the server's out-of-order check.
    var countedAt: Date = Date.distantPast
    var notes: String?
    var lines: [DraftLine] = []

    /// Minted here so a draft cannot exist without an identity. Resuming
    /// fetches the open draft rather than building a new one, which is what
    /// keeps the id stable across edits.
    init(
        clientRequestId: String = UUID().uuidString,
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
/// `remaining` is `nil` until counted, and that nil is load-bearing — see
/// `makeSubmission`. `priceCents` and `par` are snapshotted at Start visit so
/// a reprice mid-route cannot rewrite what was charged.
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
    /// **A slot with no `remaining` emits no line.** Trap 3: treating an
    /// uncounted slot as zero books the leftover as sold and invents revenue
    /// nothing downstream can detect.
    ///
    /// `nil` rather than empty because the server rejects empty `lines`, and
    /// learning that after a drain is hours too late.
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
