import ClerkKit
import SwiftData
import SwiftUI

@main
struct VendpireApp: App {
    @State private var session = ClerkSession()
    @State private var clientSupport = ClientSupport()
    @State private var lock = LocalLock()
    @State private var refresher: MirrorRefresher
    private let container: ModelContainer

    @Environment(\.scenePhase) private var scenePhase

    init() {
        Clerk.configure(publishableKey: AppEnvironment.clerkPublishableKey)
        let container = VendpireStore.makeContainer()
        self.container = container
        _refresher = State(
            initialValue: MirrorRefresher(
                api: VendpireAPIClient(),
                writer: MirrorWriter(context: container.mainContext)
            )
        )
    }

    var body: some Scene {
        WindowGroup {
            RootView(lock: lock, clientSupport: clientSupport)
            .environment(session)
            .environment(clientSupport)
            .environment(refresher)
            .modelContainer(container)
            .task {
                #if DEBUG
                clientSupport.applyLaunchArgumentOverride()
                #endif
                // Clerk rehydrates a persisted session itself; this only reads
                // the result. It must never gate what is shown — a cold offline
                // launch is expected to fail here.
                session.refreshFromClerk()
                await refresher.refresh()
            }
            .onChange(of: scenePhase) { _, phase in
                guard phase == .active else { return }
                Task { await refresher.refresh() }
            }
        }
    }
}
