import ClerkKit
import SwiftData
import SwiftUI

@main
struct VendpireApp: App {
    @State private var session = ClerkSession()
    private let container = VendpireStore.makeContainer()

    init() {
        Clerk.configure(publishableKey: AppEnvironment.clerkPublishableKey)
    }

    var body: some Scene {
        WindowGroup {
            AccountView()
                .environment(session)
                .modelContainer(container)
                .task {
                    // Clerk rehydrates a persisted session itself; this only
                    // reads the result. It must never gate what is shown —
                    // a cold offline launch is expected to fail here.
                    session.refreshFromClerk()
                }
        }
    }
}
