import SwiftUI

/// Lagoon's full-width pill button: `.buttonStyle(.primaryPill)` for the main
/// action, `.buttonStyle(.softPill)` for the one beside it.
struct PillButtonStyle: ButtonStyle {
    enum Prominence {
        case primary
        case soft
    }

    let prominence: Prominence

    @Environment(\.isEnabled) private var isEnabled

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.body.bold())
            .labelStyle(PillLabelStyle())
            .foregroundStyle(prominence == .primary ? Color.white : Color.linkText)
            .frame(maxWidth: .infinity, minHeight: 52)
            .background(prominence == .primary ? Color.action : Color.actionSoft, in: Capsule())
            .opacity(isEnabled ? 1 : 0.5)
            .scaleEffect(configuration.isPressed ? 0.96 : 1)
            .animation(.easeOut(duration: 0.12), value: configuration.isPressed)
            .contentShape(Capsule())
    }
}

extension ButtonStyle where Self == PillButtonStyle {
    static var primaryPill: PillButtonStyle { PillButtonStyle(prominence: .primary) }
    static var softPill: PillButtonStyle { PillButtonStyle(prominence: .soft) }
}

/// Icon and title side by side with the mockup's 8pt gap, rather than
/// whatever spacing the surrounding list would pick.
private struct PillLabelStyle: LabelStyle {
    func makeBody(configuration: Configuration) -> some View {
        HStack(spacing: 8) {
            configuration.icon
            configuration.title
        }
    }
}
