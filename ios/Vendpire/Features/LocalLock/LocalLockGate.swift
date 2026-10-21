import SwiftUI

/// Wraps the app. Nothing below it renders until the device owner is
/// confirmed — unlike the update wall, hiding the store is the point here.
struct LocalLockGate<Content: View>: View {
    let lock: LocalLock
    @ViewBuilder var content: () -> Content

    @Environment(\.scenePhase) private var scenePhase

    var body: some View {
        Group {
            if lock.isUnlocked {
                content()
            } else {
                LockedView(state: lock.state) {
                    Task { await lock.unlock() }
                }
            }
        }
        .task {
            await lock.unlock()
        }
        .onChange(of: scenePhase) { _, phase in
            switch phase {
            case .background: lock.backgrounded()
            case .active: lock.foregrounded()
            default: break
            }
        }
    }
}

private struct LockedView: View {
    let state: LocalLock.State
    let onUnlock: () -> Void

    var body: some View {
        VStack(spacing: 16) {
            Image(systemName: "lock.fill")
                .font(.system(size: 44))
                .foregroundStyle(.secondary)

            Text("Vendpire is locked")
                .font(.headline)

            if state == .authenticating {
                ProgressView()
            } else {
                Button("Unlock", action: onUnlock)
                    .buttonStyle(.borderedProminent)
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(.background)
    }
}
