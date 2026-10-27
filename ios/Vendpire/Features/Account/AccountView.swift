import SwiftUI

/// Account status and the way in to signing in.
///
/// Reached from the location list, never placed in front of it: sign-in is
/// somewhere you navigate to, not something you are stuck behind. See
/// ARCHITECTURE.md, "Auth never gates the store".
struct AccountView: View {
    @Environment(ClerkSession.self) private var session
    @Environment(ClientSupport.self) private var clientSupport

    var body: some View {
        List {
            Section {
                NavigationLink("Waiting to sync") {
                    OutboxReviewView()
                }
            }

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

            #if DEBUG
            updateWallSection()
            #endif
        }
        .navigationTitle("Account")
    }

    /// The session token's organization claim on screen as well as in the
    /// console, so it can be screenshotted rather than retyped.
    #if DEBUG
    /// Forces the wall, whose trigger never occurs in normal development.
    @ViewBuilder
    private func updateWallSection() -> some View {
        Section("Update wall (Debug)") {
            Picker("Requirement", selection: Binding(
                get: { clientSupport.requirement },
                set: { clientSupport.apply($0, updateUrl: Self.debugUpdateUrl) }
            )) {
                Text("none").tag(UpdateRequirement.none)
                Text("recommended").tag(UpdateRequirement.recommended)
                Text("required").tag(UpdateRequirement.required)
            }
            LabeledContent("This build", value: ClientBuild.current.map(String.init) ?? "unreadable")
        }
    }

    private static let debugUpdateUrl = URL(string: "https://apps.apple.com/app/id000000000")
    #endif

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
