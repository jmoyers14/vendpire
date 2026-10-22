import SwiftData
import SwiftUI

/// Decides what a launch opens onto.
///
/// `StoreMetadata` exists only once an organization has been mirrored, so its
/// absence is the one honest signal that this device has nothing yet.
struct RootView: View {
    let lock: LocalLock
    let clientSupport: ClientSupport

    @Query private var metadata: [StoreMetadata]

    private var hasMirroredOrg: Bool { !metadata.isEmpty }

    var body: some View {
        // An empty store holds nothing worth gating, and a biometric prompt
        // before the app has explained itself teaches people to dismiss the
        // one that matters later.
        LocalLockGate(lock: lock, isArmed: hasMirroredOrg) {
            if hasMirroredOrg {
                LocationListView()
                    .updateWall(clientSupport)
            } else {
                FirstRunView()
            }
        }
    }
}

/// Shown until this device has mirrored an organization.
///
/// The only screen that routes to sign-in rather than waiting to be found —
/// and only because there is nothing else to show. Once the store has content
/// it never appears again, signed in or not.
private struct FirstRunView: View {
    @Environment(ClerkSession.self) private var session

    var body: some View {
        NavigationStack {
            if session.isSignedIn {
                // Matches LocationListView's toolbar so account access sits in the
                // same place everywhere; this is the one signed-in screen that
                // otherwise has no way back to Sign Out.
                ContentUnavailableView(
                    "Nothing synced yet",
                    systemImage: "arrow.trianglehead.2.clockwise",
                    description: Text("This organization's machines will appear once they sync.")
                )
                .toolbar {
                    ToolbarItem(placement: .topBarTrailing) {
                        NavigationLink(destination: AccountView()) {
                            Image(systemName: "person.crop.circle")
                        }
                        .accessibilityLabel("Account")
                    }
                }
            } else {
                ContentUnavailableView {
                    Label("Welcome to Vendpire", systemImage: "shippingbox")
                } description: {
                    Text("Sign in to pull your organization's machines onto this device.")
                } actions: {
                    NavigationLink("Sign In") { SignInView() }
                        .buttonStyle(.borderedProminent)
                }
            }
        }
    }
}
