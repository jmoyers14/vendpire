import ClerkKit
import Foundation

/// Owns authentication: signing in, activating the organization, and reporting
/// what the resulting token actually claims.
///
/// Per ARCHITECTURE.md this is a service — views call it and read its `state`,
/// and it never hands back rows. Nothing in the app is gated on it: a signed-out
/// or offline session must never hide the local store.
@MainActor
@Observable
final class ClerkSession {
    enum State: Equatable {
        case signedOut
        case signingIn
        case signedIn(organizationId: String?)
        case failed(message: String)
    }

    /// What the session token claimed before and after the organization was
    /// activated. Two samples rather than one because the difference is the
    /// finding: if the org claim is absent first and present after, the answer
    /// is "activation was required", not "the SDK cannot do it".
    struct ClaimReport: Equatable, Sendable {
        var beforeActivation: SessionTokenClaims?
        var afterActivation: SessionTokenClaims?
        var activatedOrganizationId: String?
        var note: String?
    }

    private(set) var state: State = .signedOut
    private(set) var claimReport: ClaimReport?

    var isSignedIn: Bool {
        if case .signedIn = state { return true }
        return false
    }

    /// Reflects a session restored from the keychain on launch. Clerk persists
    /// and rehydrates the session itself, so there is nothing to store here.
    func refreshFromClerk() {
        guard Clerk.shared.session != nil else {
            state = .signedOut
            return
        }
        state = .signedIn(organizationId: Clerk.shared.session?.lastActiveOrganizationId)
    }

    func signIn(email: String, password: String) async {
        state = .signingIn
        claimReport = nil

        do {
            let attempt = try await Clerk.shared.auth.signInWithPassword(
                identifier: email,
                password: password
            )

            // A password user should complete in one step. Anything else means
            // the instance wants another factor, which this screen can't serve.
            guard attempt.status == .complete else {
                state = .failed(message: "Sign-in needs another step: \(attempt.status)")
                return
            }

            var report = ClaimReport()
            report.beforeActivation = try? await currentClaims()
            report.activatedOrganizationId = try await activateOrganizationIfNeeded()
            report.afterActivation = try? await currentClaims()
            if report.activatedOrganizationId == nil {
                report.note = "No organization membership found for this user."
            }
            claimReport = report
            log(report)

            state = .signedIn(
                organizationId: report.afterActivation?.organizationId
                    ?? Clerk.shared.session?.lastActiveOrganizationId
            )
        } catch {
            state = .failed(message: error.localizedDescription)
        }
    }

    func signOut() async {
        do {
            try await Clerk.shared.auth.signOut()
        } catch {
            // Signing out locally matters more than the server round trip
            // succeeding; the next launch reconciles either way.
        }
        claimReport = nil
        state = .signedOut
    }

    /// Clerk only puts an organization claim in the token when an organization
    /// is *active* — membership alone is not enough. A fresh user has no active
    /// organization, so without this call the token names no org and every
    /// `orgProtectedProcedure` would reject it.
    ///
    /// No picker: this is a two-person business with one organization. If that
    /// ever stops being true, this is where the choice belongs.
    @discardableResult
    private func activateOrganizationIfNeeded() async throws -> String? {
        guard let session = Clerk.shared.session else { return nil }

        let memberships = Clerk.shared.user?.organizationMemberships ?? []
        guard let organizationId = memberships.first?.organization.id else {
            return nil
        }

        if session.lastActiveOrganizationId != organizationId {
            try await Clerk.shared.auth.setActive(
                sessionId: session.id,
                organizationId: organizationId
            )
        }
        return organizationId
    }

    private func currentClaims() async throws -> SessionTokenClaims? {
        guard let token = try await Clerk.shared.auth.getToken() else { return nil }
        return try SessionTokenDecoder.claims(from: token)
    }

    /// Printed rather than returned because the DECIDE subtask asks for the
    /// result to be written down, and the console is where it gets read off.
    private func log(_ report: ClaimReport) {
        print("""

        ───────── Clerk session token claims ─────────
        memberships activated : \(report.activatedOrganizationId ?? "none")
        org claim BEFORE      : \(report.beforeActivation?.organizationId ?? "ABSENT")
        org claim AFTER       : \(report.afterActivation?.organizationId ?? "ABSENT")
        claim names AFTER     : \(report.afterActivation?.claimNames.joined(separator: ", ") ?? "-")
        \(report.note ?? "")
        payload AFTER:
        \(report.afterActivation?.prettyPrinted ?? "-")
        ──────────────────────────────────────────────

        """)
    }
}
