import SwiftUI

/// Account status and the way in to signing in.
///
/// This is the app's root *for now* only because there are no store-backed
/// screens yet. When the location list arrives it becomes the root and this
/// moves behind it — sign-in stays somewhere you can navigate to, never
/// something you are stuck behind. See ARCHITECTURE.md, "Auth never gates the
/// store".
struct AccountView: View {
    @Environment(ClerkSession.self) private var session

    var body: some View {
        NavigationStack {
            List {
                Section("Status") {
                    switch session.state {
                    case .signedOut:
                        Label("Signed out", systemImage: "person.slash")
                    case .signingIn:
                        Label("Signing in…", systemImage: "ellipsis.circle")
                    case .signedIn(let organizationId):
                        Label("Signed in", systemImage: "person.badge.shield.checkmark")
                        LabeledContent("Organization", value: organizationId ?? "none")
                    case .failed(let message):
                        Label(message, systemImage: "exclamationmark.triangle")
                            .foregroundStyle(.red)
                    }
                }

                if session.isSignedIn {
                    Section {
                        Button("Sign Out", role: .destructive) {
                            Task { await session.signOut() }
                        }
                    }
                } else {
                    Section {
                        NavigationLink("Sign In") { SignInView() }
                    }
                }

                if let report = session.claimReport {
                    claimReportSection(report)
                }
            }
            .navigationTitle("Vendpire")
        }
    }

    /// Phase 2's DECIDE subtask on screen as well as in the console, so the
    /// finding can be screenshotted rather than retyped.
    @ViewBuilder
    private func claimReportSection(_ report: ClerkSession.ClaimReport) -> some View {
        Section("Session token claims") {
            LabeledContent("Membership org", value: report.membershipOrganizationId ?? "none")
            LabeledContent("setActive called", value: report.didCallSetActive ? "yes" : "no")
            LabeledContent(
                "org claim before",
                value: report.beforeActivation?.organizationId ?? "ABSENT"
            )
            LabeledContent(
                "org claim after",
                value: report.afterActivation?.organizationId ?? "ABSENT"
            )
            if let claims = report.afterActivation {
                LabeledContent("claims", value: claims.claimNames.joined(separator: ", "))
            }
            if let note = report.note {
                Text(note).font(.footnote).foregroundStyle(.secondary)
            }
        }
    }
}
