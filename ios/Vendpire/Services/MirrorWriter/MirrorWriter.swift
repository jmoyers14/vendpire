import Foundation
import SwiftData

/// Replaces the org's state in the store wholesale: org check, upsert by server
/// id, remove what the payload no longer carries, stamp `lastSyncedAt`.
///
/// Remove-missing is the step that matters — a mirror that only adds will show a
/// machine deleted months ago — and it is what makes this safe to re-run.
@MainActor
final class MirrorWriter {
    private let context: ModelContext

    init(context: ModelContext) {
        self.context = context
    }

    /// `syncedAt` is passed rather than read off the payload: the fixture was
    /// exported at a known time, a live refresh was assembled just now, and the
    /// writer should not have to know which it is holding.
    func apply(_ remote: RemoteOrg, syncedAt: Date) throws {
        do {
            try wipeIfOrgChanged(to: remote.orgId)

            try reconcile(
                remote.locations,
                idOfRemote: \.id,
                idOfStored: \StoredLocation.id,
                update: { stored, remote in stored.update(from: remote) },
                insert: { StoredLocation($0) }
            )
            try reconcile(
                remote.machines,
                idOfRemote: \.id,
                idOfStored: \StoredMachine.id,
                update: { stored, remote in stored.update(from: remote) },
                insert: { StoredMachine($0) }
            )
            try reconcile(
                remote.products,
                idOfRemote: \.id,
                idOfStored: \StoredProduct.id,
                update: { stored, remote in stored.update(from: remote) },
                insert: { StoredProduct($0) }
            )
            try reconcile(
                remote.packs,
                idOfRemote: \.id,
                idOfStored: \StoredPack.id,
                update: { stored, remote in stored.update(from: remote) },
                insert: { StoredPack($0) }
            )
            try reconcile(
                remote.planograms,
                idOfRemote: \.id,
                idOfStored: \StoredPlanogram.id,
                update: { stored, remote in stored.update(from: remote) },
                insert: { StoredPlanogram($0) }
            )

            try stamp(orgId: remote.orgId, at: syncedAt)
            try context.save()
        } catch {
            discardPendingChanges()
            throw error
        }
    }

    /// Applied on its own boundary, after the reference data. Nothing joins
    /// against latest visits, so losing a refresh of them tears nothing.
    func applyLatestVisits(_ visits: [RemoteVisit]) throws {
        do {
            try reconcile(
                visits,
                idOfRemote: \.machineId,
                idOfStored: \StoredLatestVisit.machineId,
                update: { stored, remote in stored.update(from: remote) },
                insert: { StoredLatestVisit($0) }
            )
            try context.save()
        } catch {
            discardPendingChanges()
            throw error
        }
    }

    /// Staged inserts and deletes do not evaporate on a throw — the next save
    /// anywhere in the app would flush them.
    private func discardPendingChanges() {
        context.rollback()
    }

    // MARK: - The org boundary

    /// Entities carry no `orgId`, so this is the only defence against cross-org
    /// leakage: there is no per-query filter that could be forgotten.
    private func wipeIfOrgChanged(to orgId: String) throws {
        let metadata = try context.fetch(FetchDescriptor<StoreMetadata>())
        guard let current = metadata.first else { return }
        guard current.orgId != orgId else { return }

        try context.delete(model: StoredLocation.self)
        try context.delete(model: StoredMachine.self)
        try context.delete(model: StoredProduct.self)
        try context.delete(model: StoredPack.self)
        try context.delete(model: StoredPlanogram.self)
        try context.delete(model: StoredLatestVisit.self)
    }

    private func stamp(orgId: String, at syncedAt: Date) throws {
        let metadata = try context.fetch(FetchDescriptor<StoreMetadata>())
        if let existing = metadata.first {
            existing.orgId = orgId
            existing.lastSyncedAt = syncedAt
            // One org per device is load-bearing; collapse duplicates rather
            // than leave the store ambiguous.
            for extra in metadata.dropFirst() { context.delete(extra) }
        } else {
            context.insert(StoreMetadata(orgId: orgId, lastSyncedAt: syncedAt))
        }
    }

    // MARK: - Upsert and remove

    private func reconcile<Model: PersistentModel, Remote>(
        _ remotes: [Remote],
        idOfRemote: (Remote) -> String,
        idOfStored: KeyPath<Model, String>,
        update: (Model, Remote) -> Void,
        insert: (Remote) -> Model
    ) throws {
        let stored = try context.fetch(FetchDescriptor<Model>())
        // #Unique on id should prevent duplicates; keeping the first beats trapping.
        var unseen = Dictionary(
            stored.map { ($0[keyPath: idOfStored], $0) },
            uniquingKeysWith: { first, _ in first }
        )

        for remote in remotes {
            if let existing = unseen.removeValue(forKey: idOfRemote(remote)) {
                update(existing, remote)
            } else {
                context.insert(insert(remote))
            }
        }

        // Anything left was absent from the payload: the server dropped it.
        for departed in unseen.values {
            context.delete(departed)
        }
    }
}
