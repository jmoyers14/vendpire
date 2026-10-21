import ClerkKit
import SwiftData
import SwiftUI

@main
struct VendpireApp: App {
    @State private var session = ClerkSession()
    @State private var clientSupport = ClientSupport()
    @State private var lock = LocalLock()
    private let container = VendpireStore.makeContainer()

    init() {
        Clerk.configure(publishableKey: AppEnvironment.clerkPublishableKey)
    }

    var body: some Scene {
        WindowGroup {
            LocalLockGate(lock: lock) {
                LocationListView()
                    .updateWall(clientSupport)
            }
            .environment(session)
            .environment(clientSupport)
            .modelContainer(container)
            .task {
                seedStore()
                #if DEBUG
                clientSupport.applyLaunchArgumentOverride()
                #endif
                // Clerk rehydrates a persisted session itself; this only
                // reads the result. It must never gate what is shown —
                // a cold offline launch is expected to fail here.
                session.refreshFromClerk()
            }
        }
    }

    /// A failed seed leaves whatever the store already held: the app renders
    /// from the store regardless of what the last fill attempt did.
    @MainActor
    private func seedStore() {
        let loader = DevFixtureLoader(writer: MirrorWriter(context: container.mainContext))
        do {
            try loader.load()
        } catch {
            assertionFailure("fixture seed failed: \(error)")
        }
    }
}
