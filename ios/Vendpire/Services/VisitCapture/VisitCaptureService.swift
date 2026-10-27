import Foundation
import SwiftData

/// Starting, resuming and submitting a visit.
///
/// Views call this and never write to the store themselves — see
/// ARCHITECTURE.md and `docs/diagrams/visit-sync.md`, which names it.
@MainActor
final class VisitCaptureService {
    private let context: ModelContext
    private let now: () -> Date

    init(context: ModelContext, now: @escaping () -> Date = Date.init) {
        self.context = context
        self.now = now
    }

    /// Resumes the machine's open draft if it holds any counts, otherwise
    /// starts a fresh one.
    ///
    /// Open means not yet submitted — a draft with no queue row beside it. A
    /// submitted-but-undrained visit must not block a new one: an operator can
    /// service the same machine twice before finding signal.
    func startVisit(at machine: StoredMachine) throws -> VisitDraft {
        if let open = try openDraft(forMachine: machine.id) {
            // One counted line is someone's work and must survive. Nothing
            // counted is not a visit in progress, and resuming it pins the
            // snapshot taken when it was started — if that was before the
            // machine had a planogram, the screen has nothing to count and no
            // way out of it.
            //
            // This is also why a mis-tap cannot strand a stale `countedAt`.
            if open.lines.contains(where: { $0.remaining != nil }) {
                return open
            }
            context.delete(open)
        }

        let planogram = try currentPlanogram(forMachine: machine.id)
        let draft = VisitDraft(
            machineId: machine.id,
            locationId: machine.locationId,
            planogramId: planogram?.id,
            countedAt: now(),
            lines: draftLines(slots: machine.slots, planogramSlots: planogram?.slots ?? [])
        )

        context.insert(draft)
        try context.save()
        return draft
    }

    /// Queues the visit, returning `false` when nothing was counted.
    ///
    /// The server rejects an empty `lines`, and discovering that after a drain
    /// means telling someone hours after they could have done anything.
    ///
    /// The draft stays until the drain confirms the visit — until then it is
    /// the operator's only copy.
    @discardableResult
    func submit(_ draft: VisitDraft) throws -> Bool {
        guard let submission = draft.makeSubmission() else { return false }

        context.insert(try OutboxItem(visit: submission))
        try context.save()
        return true
    }

    private func openDraft(forMachine machineId: String) throws -> VisitDraft? {
        let drafts = try context.fetch(
            FetchDescriptor<VisitDraft>(predicate: #Predicate { $0.machineId == machineId })
        )
        let queued = Set(try context.fetch(FetchDescriptor<OutboxItem>()).map(\.id))

        return drafts.first { !queued.contains($0.clientRequestId) }
    }

    private func currentPlanogram(forMachine machineId: String) throws -> StoredPlanogram? {
        var descriptor = FetchDescriptor<StoredPlanogram>(
            predicate: StoredPlanogram.forMachine(machineId),
            sortBy: StoredPlanogram.newestFirst
        )
        descriptor.fetchLimit = 1
        return try context.fetch(descriptor).first
    }

    /// Authored order, planogrammed slots only — the same rule `CaptureOrder`
    /// walks by. Nothing is pre-filled: a missing count is not a zero.
    private func draftLines(slots: [[String]], planogramSlots: [PlanogramSlot]) -> [DraftLine] {
        let bySlotCode = Dictionary(
            planogramSlots.map { ($0.slotCode, $0) }
        ) { first, _ in first }

        return slots.flatMap { $0 }.compactMap { slotCode in
            guard let slot = bySlotCode[slotCode] else { return nil }

            return DraftLine(
                slotCode: slotCode,
                productId: slot.productId,
                remaining: nil,
                added: nil,
                removed: 0,
                removedReason: nil,
                priceCents: slot.priceCents,
                par: slot.par,
                bestBy: nil
            )
        }
    }
}
