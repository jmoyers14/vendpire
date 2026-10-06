import ClerkKit
import SwiftUI

@main
struct VendpireApp: App {
    @State private var session = ClerkSession()

    init() {
        Clerk.configure(publishableKey: AppEnvironment.clerkPublishableKey)
    }

    var body: some Scene {
        WindowGroup {
            AccountView()
                .environment(session)
                .task {
                    // Clerk rehydrates a persisted session itself; this only
                    // reads the result. It must never gate what is shown —
                    // a cold offline launch is expected to fail here.
                    session.refreshFromClerk()
                }
        }
    }
}
