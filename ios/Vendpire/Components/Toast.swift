import SwiftUI

extension View {
    /// A short confirmation floating over the bottom of the screen. Setting
    /// the message shows it; it clears itself.
    func toast(_ message: Binding<String?>) -> some View {
        modifier(ToastModifier(message: message))
    }
}

private struct ToastModifier: ViewModifier {
    @Binding var message: String?

    func body(content: Content) -> some View {
        content
            .overlay(alignment: .bottom) {
                if let message {
                    HStack(spacing: 8) {
                        Image(systemName: "checkmark.circle.fill")
                            .foregroundStyle(.success)
                        Text(message)
                            .foregroundStyle(.heading)
                    }
                    .font(.subheadline.bold())
                    .padding(.horizontal, 16)
                    .padding(.vertical, 10)
                    .background(.card, in: Capsule())
                    .overlay(Capsule().strokeBorder(.line))
                    .shadow(color: .black.opacity(0.12), radius: 8, y: 2)
                    .padding(.bottom, 24)
                    .transition(.move(edge: .bottom).combined(with: .opacity))
                }
            }
            .animation(.snappy, value: message)
            .task(id: message) {
                guard let message else { return }
                AccessibilityNotification.Announcement(message).post()
                do {
                    try await Task.sleep(for: .seconds(2.5))
                } catch {
                    // A newer message replaced this one and owns the clearing.
                    return
                }
                self.message = nil
            }
    }
}
