import SwiftUI

/// A bordered numeric field with a leading label — "$" for money, "Qty" for a
/// count — and a right-aligned value, as in the purchase mockup.
///
/// Focus belongs to the screen, so the keyboard's arrows can move between
/// fields: pass its `FocusState` binding and the value that means "this one".
///
/// `accessibilityLabel` replaces the visible label for VoiceOver: a row of
/// fields that all read "$" can't tell the operator which line they're on.
struct BoxedField<Field: Hashable>: View {
    let label: String
    let accessibilityLabel: String
    @Binding var text: String
    var placeholder: String = ""
    var keyboard: UIKeyboardType = .decimalPad
    let focus: FocusState<Field?>.Binding
    let field: Field

    private var isFocused: Bool { focus.wrappedValue == field }

    var body: some View {
        HStack(spacing: 4) {
            Text(label)
                .foregroundStyle(.secondaryText)
                .accessibilityHidden(true)
            TextField(placeholder, text: $text)
                .accessibilityLabel(accessibilityLabel)
                .keyboardType(keyboard)
                .multilineTextAlignment(.trailing)
                .monospacedDigit()
                .foregroundStyle(.heading)
                .focused(focus, equals: field)
        }
        .padding(.horizontal, 12)
        .frame(minHeight: 44)
        .background(.card, in: shape)
        .overlay(shape.strokeBorder(.fieldBorder))
        .overlay {
            if isFocused {
                shape.inset(by: -4).strokeBorder(.focus, lineWidth: 2)
            }
        }
        // The whole box is the target, not just the digits at its right edge.
        .contentShape(shape)
        .onTapGesture { focus.wrappedValue = field }
    }

    private var shape: RoundedRectangle {
        RoundedRectangle(cornerRadius: LagoonRadius.field, style: .continuous)
    }
}
