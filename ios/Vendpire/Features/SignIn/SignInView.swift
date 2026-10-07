import SwiftUI

/// Email + password sign-in. Holds field state and nothing else — the flow,
/// the organization activation, and the claim reporting all live in
/// `ClerkSession`.
struct SignInView: View {
    @Environment(ClerkSession.self) private var session
    @Environment(\.dismiss) private var dismiss

    @State private var email = ""
    @State private var password = ""

    private var canSubmit: Bool {
        !email.isEmpty && !password.isEmpty && session.state != .signingIn
    }

    var body: some View {
        Form {
            Section {
                TextField("Email", text: $email)
                    .textContentType(.emailAddress)
                    .keyboardType(.emailAddress)
                    .textInputAutocapitalization(.never)
                    .autocorrectionDisabled()

                SecureField("Password", text: $password)
                    .textContentType(.password)
            }

            Section {
                Button(action: submit) {
                    if session.state == .signingIn {
                        ProgressView()
                    } else {
                        Text("Sign In")
                    }
                }
                .disabled(!canSubmit)
            } footer: {
                if case .failed(let message) = session.state {
                    Text(message).foregroundStyle(.red)
                }
            }
        }
        .navigationTitle("Sign In")
        // Success is otherwise invisible from this screen: the state change
        // lands on AccountView behind it, and the form just sits there.
        .onChange(of: session.isSignedIn) { _, signedIn in
            if signedIn { dismiss() }
        }
    }

    private func submit() {
        Task { await session.signIn(email: email, password: password) }
    }
}
