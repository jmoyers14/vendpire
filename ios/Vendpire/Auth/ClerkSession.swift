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

    /// What the session token claimed before and after organization activation.
    ///
    /// Two samples rather than one because the difference is the finding. On the
    /// instance this was built against the claim is already present *before*
    /// activation — Clerk auto-activates a lone membership at sign-in — so
    /// `didCallSetActive` records whether the explicit call was needed at all,
    /// rather than implying it did the work.
    struct ClaimReport: Equatable, Sendable {
        var beforeActivation: SessionTokenClaims?
        var afterActivation: SessionTokenClaims?
        var membershipOrganizationId: String?
        var didCallSetActive = false
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

        #if DEBUG
            // Delimited and counted so whitespace or a substituted character is
            // visible rather than inferred. Never logs the password itself.
            print("""
            [signIn] identifier=<\(email)> count=\(email.count) \
            password.count=\(password.count) clerkLoaded=\(Clerk.shared.isLoaded)
            """)
        #endif

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
            (report.membershipOrganizationId, report.didCallSetActive) =
                try await activateOrganizationIfNeeded()
            report.afterActivation = try? await currentClaims()
            if report.membershipOrganizationId == nil {
                report.note = "No organization membership found for this user."
            }
            claimReport = report
            log(report)

            state = .signedIn(
                organizationId: report.afterActivation?.organizationId
                    ?? Clerk.shared.session?.lastActiveOrganizationId
            )
        } catch {
            state = .failed(message: describe(error))
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
    /// is *active* — membership alone is not enough.
    ///
    /// In practice Clerk activates a lone membership during sign-in, so this is
    /// usually a no-op. It stays because that behaviour is Clerk's to change,
    /// and because a user who later belongs to more than one organization would
    /// have no active one by default. No picker: this is a two-person business
    /// with one organization, and if that stops being true, the choice belongs
    /// here.
    ///
    /// - Returns: the membership's organization id, and whether `setActive` was
    ///   actually called.
    private func activateOrganizationIfNeeded() async throws -> (String?, Bool) {
        guard let session = Clerk.shared.session else { return (nil, false) }

        let memberships = Clerk.shared.user?.organizationMemberships ?? []
        guard let organizationId = memberships.first?.organization.id else {
            return (nil, false)
        }

        guard session.lastActiveOrganizationId != organizationId else {
            return (organizationId, false)
        }

        try await Clerk.shared.auth.setActive(
            sessionId: session.id,
            organizationId: organizationId
        )
        return (organizationId, true)
    }

    private func currentClaims() async throws -> SessionTokenClaims? {
        guard let token = try await Clerk.shared.auth.getToken() else { return nil }
        return try SessionTokenDecoder.claims(from: token)
    }

    /// `localizedDescription` flattens Clerk's errors to a short phrase like
    /// "Identifier is invalid", hiding the code and the offending parameter —
    /// the two things that tell a format rejection apart from a missing account.
    private func describe(_ error: Error) -> String {
        guard let apiError = error as? ClerkAPIError else {
            print("[signIn] non-API error: \(error)")
            return error.localizedDescription
        }
        print("""
        [signIn] ClerkAPIError
                 code    : \(apiError.code)
                 param   : \(apiError.meta?["param_name"]?.stringValue ?? "-")
                 message : \(apiError.message ?? "-")
                 long    : \(apiError.longMessage ?? "-")
                 traceId : \(apiError.clerkTraceId ?? "-")
        """)
        return "\(apiError.code): \(apiError.longMessage ?? apiError.message ?? "unknown")"
    }

    /// Printed as well as shown on screen because the DECIDE subtask asks for
    /// the result to be written down, and the console is where it is read off.
    private func log(_ report: ClaimReport) {
        print("""

        ───────── Clerk session token claims ─────────
        membership org  : \(report.membershipOrganizationId ?? "none")
        setActive called: \(report.didCallSetActive)
        org claim BEFORE: \(report.beforeActivation?.organizationId ?? "ABSENT")
        org claim AFTER : \(report.afterActivation?.organizationId ?? "ABSENT")
        claim names     : \(report.afterActivation?.claimNames.joined(separator: ", ") ?? "-")
        \(report.note ?? "")
        payload AFTER:
        \(report.afterActivation?.prettyPrinted ?? "-")
        ──────────────────────────────────────────────

        """)
    }
}
