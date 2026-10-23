import Foundation

/// What the last refresh did. Status, never rows — rows come from `@Query`.
///
/// A `failed` message is a lowercase clause, not a sentence: the one place it
/// is shown appends it after "As of 3 days ago · ".
nonisolated enum MirrorState: Equatable, Sendable {
    case idle
    case refreshing
    case failed(message: String)
    case synced(at: Date)
}

/// Fills the mirror from `/api/v1`.
///
/// Order is load-bearing: `MirrorWriter.reconcile` deletes rows absent from
/// what it's handed, so every reference fetch must complete before any reaches
/// the writer, or a failed refresh would delete data instead of leaving it alone.
@MainActor
@Observable
final class MirrorRefresher {
    private(set) var state: MirrorState = .idle

    private let api: any VendpireAPI
    private let writer: MirrorWriter

    init(api: any VendpireAPI, writer: MirrorWriter) {
        self.api = api
        self.writer = writer
    }

    func refresh() async {
        // `.task` and `.onChange(of: scenePhase)` both fire this within
        // milliseconds of each other at launch. Without this guard, whichever
        // finishes last wins `state`, which can report a transient failure
        // over data that's already current, and doubles the request count.
        guard state != .refreshing else { return }
        state = .refreshing

        do {
            let identity = try await api.fetchIdentity()
            guard let orgId = identity.orgId else {
                // A real state, not a failure to retry: the token is fine and
                // the six reads below would 403 with no way to say why.
                state = .failed(message: "you're not in an organization")
                return
            }

            // Serial and early-exit: offline should cost one failed request,
            // not five. The payload is well under 100 KB, so the latency this
            // trades away is invisible on a background refresh.
            let locations = try await api.fetchLocations()
            let machines = try await api.fetchMachines()
            let products = try await api.fetchProducts()
            let packs = try await api.fetchPacks()
            let planograms = try await api.fetchCurrentPlanograms()

            let syncedAt = Date()
            let org = RemoteOrg(
                orgId: orgId,
                locations: locations,
                machines: machines,
                products: products,
                packs: packs,
                planograms: planograms
            )

            do {
                try writer.apply(org, syncedAt: syncedAt)
            } catch {
                // A throw here means the LOCAL store is broken, not the
                // network — retrying can't fix it, hence the distinct message.
                // The return is load-bearing: drop it and `.synced` gets
                // reported over a write that just failed.
                state = .failed(message: "couldn't save to the local store")
                return
            }
            state = .synced(at: syncedAt)
        } catch {
            // A fetch failure here means the writer was never touched — the
            // store may still hold a previous, possibly wrong-org, snapshot.
            // The return is load-bearing: without it, control falls into the
            // visits block below and writes into that stale store with
            // nothing left to repair it afterward.
            state = .failed(message: "couldn't reach the server")
            return
        }

        // Applied after the reference data so machineId and productId resolve,
        // and on its own boundary: nothing joins against latest visits, so a
        // failure here tears nothing and must not fail the refresh.
        if let visits = try? await api.fetchLatestVisits() {
            try? writer.applyLatestVisits(visits)
        }
    }
}
