import SwiftUI

/// A bordered numeric field with a leading label — "$" for money, "Qty" for a
/// count — and a right-aligned value, as in the purchase mockup.
struct BoxedField: View {
    let label: String
    @Binding var text: String
    var placeholder: String = ""
    var keyboard: UIKeyboardType = .decimalPad

    @FocusState private var isFocused: Bool

    var body: some View {
        HStack(spacing: 4) {
            Text(label)
                .foregroundStyle(.secondaryText)
            TextField(placeholder, text: $text)
                .keyboardType(keyboard)
                .multilineTextAlignment(.trailing)
                .monospacedDigit()
                .foregroundStyle(.heading)
                .focused($isFocused)
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
        .onTapGesture { isFocused = true }
    }

    private var shape: RoundedRectangle {
        RoundedRectangle(cornerRadius: LagoonRadius.field, style: .continuous)
    }
}
