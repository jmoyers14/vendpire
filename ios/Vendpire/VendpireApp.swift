import ClerkKit
import SwiftData
import SwiftUI

@main
struct VendpireApp: App {
    @State private var session = ClerkSession()
    @State private var clientSupport = ClientSupport()
    @State private var lock = LocalLock()
    @State private var refresher: MirrorRefresher
    @State private var submitter: OutboxSubmitter
    private let container: ModelContainer

    @Environment(\.scenePhase) private var scenePhase

    init() {
        Clerk.configure(publishableKey: AppEnvironment.clerkPublishableKey)
        let container = VendpireStore.makeContainer()
        self.container = container
        // One client for both pipes: same base URL, same auth middleware.
        let api = VendpireAPIClient()
        _refresher = State(
            initialValue: MirrorRefresher(
                api: api,
                writer: MirrorWriter(context: container.mainContext)
            )
        )
        _submitter = State(
            initialValue: OutboxSubmitter(api: api, context: container.mainContext)
        )
    }

    var body: some Scene {
        WindowGroup {
            RootView(lock: lock, clientSupport: clientSupport)
            .environment(session)
            .environment(clientSupport)
            .environment(refresher)
            .environment(submitter)
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
                await submitter.drain()
            }
            // Backoff needs a retry lifecycle events will not provide: submit
            // in a basement, walk upstairs, never background the app.
            .task {
                while !Task.isCancelled {
                    try? await Task.sleep(for: .seconds(30))
                    await submitter.drain()
                }
            }
            .onChange(of: scenePhase) { _, phase in
                guard phase == .active else { return }
                Task {
                    await refresher.refresh()
                    await submitter.drain()
                }
            }
            // Signing in happens in-app, so neither trigger above fires for it.
            // Without this a fresh install dead-ends: the launch refresh 401s
            // with no session, and FirstRunView has nothing to pull on.
            .onChange(of: session.isSignedIn) { _, signedIn in
                guard signedIn else { return }
                Task {
                    await refresher.refresh()
                    // A draft queued before sign-in drains as soon as there is
                    // a token.
                    await submitter.drain()
                }
            }
        }
    }
}
