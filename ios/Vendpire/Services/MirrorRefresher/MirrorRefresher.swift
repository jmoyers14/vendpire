import Foundation

/// What the last refresh did. Status, never rows — rows come from `@Query`.
nonisolated enum MirrorState: Equatable, Sendable {
    case idle
    case refreshing
    case failed(message: String)
    case synced(at: Date)
}

/// Fills the mirror from `/api/v1`.
///
/// The ordering is load-bearing. `MirrorWriter.reconcile` deletes rows absent
/// from the array it is handed, so a payload missing an entity is a deletion
/// rather than a smaller refresh. Every reference fetch therefore has to return
/// before any of them reaches the writer — which makes "a failed refresh never
/// clears the store" a property of the shape rather than of remembering to
/// check.
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
        state = .refreshing

        do {
            let identity = try await api.fetchIdentity()
            guard let orgId = identity.orgId else {
                // A real state, not a failure to retry: the token is fine and
                // the six reads below would 403 with no way to say why.
                state = .failed(message: "You're not in an organization.")
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
            try writer.apply(org, syncedAt: syncedAt)
            state = .synced(at: syncedAt)
        } catch {
            state = .failed(message: "Couldn't reach the server.")
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
