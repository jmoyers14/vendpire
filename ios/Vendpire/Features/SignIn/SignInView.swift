import SwiftUI

/// Email + password sign-in. Holds field state and nothing else — the flow,
/// the organization activation, and the claim reporting all live in
/// `ClerkSession`.
struct SignInView: View {
    @Environment(ClerkSession.self) private var session

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
    }

    private func submit() {
        Task { await session.signIn(email: email, password: password) }
    }
}
