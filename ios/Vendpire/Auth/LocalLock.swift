import Foundation
import LocalAuthentication

/// Evaluates the device owner check. Seam so the gate can be tested without a
/// biometric prompt.
protocol LocalAuthenticator: Sendable {
    /// False when the device has no passcode enrolled — there is then nothing
    /// to authenticate against.
    func canAuthenticate() -> Bool
    func authenticate(reason: String) async -> Bool
}

nonisolated struct DeviceAuthenticator: LocalAuthenticator {
    func canAuthenticate() -> Bool {
        LAContext().canEvaluatePolicy(.deviceOwnerAuthentication, error: nil)
    }

    func authenticate(reason: String) async -> Bool {
        // A fresh context per attempt: a reused one caches a previous success
        // and returns immediately, which would make a re-lock decorative.
        let context = LAContext()
        guard context.canEvaluatePolicy(.deviceOwnerAuthentication, error: nil) else {
            return false
        }
        return (try? await context.evaluatePolicy(.deviceOwnerAuthentication, localizedReason: reason)) ?? false
    }
}

/// The app's only gate. The store is readable without a token, so this is what
/// stands between a lost phone and an org's entire catalogue.
///
/// It never clears the store and never exits: a failed unlock is not a
/// sign-out, and the data is still the operator's once they retry.
@MainActor
@Observable
final class LocalLock {
    enum State: Equatable {
        case locked
        case authenticating
        case unlocked
    }

    /// Leaving the app is constant while servicing — a camera, a phone call,
    /// the drive to the next location. Re-prompting on every return is how
    /// people turn the feature off, and a disabled lock protects nothing. An
    /// hour is roughly once per shift; shorten it if that ever feels loose.
    static let graceInterval: TimeInterval = 60 * 60

    private(set) var state: State = .locked

    private let authenticator: any LocalAuthenticator
    private let reason = "Unlock Vendpire"
    private var leftAt: Date?

    init(authenticator: any LocalAuthenticator = DeviceAuthenticator()) {
        self.authenticator = authenticator
    }

    var isUnlocked: Bool { state == .unlocked }

    func unlock(now: Date = Date()) async {
        guard state != .unlocked else { return }

        // No passcode on the device means the gate can only stop the
        // legitimate user — what it would protect is already reachable by
        // anyone holding the phone. See docs/diagrams/auth-gates.md.
        guard authenticator.canAuthenticate() else {
            markUnlocked(at: now)
            return
        }

        state = .authenticating
        if await authenticator.authenticate(reason: reason) {
            markUnlocked(at: now)
        } else {
            state = .locked
        }
    }

    func backgrounded(now: Date = Date()) {
        guard state == .unlocked else { return }
        leftAt = now
    }

    /// Re-locks only once the operator has been away for the grace period.
    /// Measured from leaving, not from unlocking, so a long session at a
    /// machine is never interrupted.
    func foregrounded(now: Date = Date()) {
        guard state == .unlocked, let leftAt else { return }
        if now.timeIntervalSince(leftAt) >= Self.graceInterval {
            state = .locked
        }
        self.leftAt = nil
    }

    private func markUnlocked(at now: Date) {
        leftAt = nil
        state = .unlocked
    }
}
