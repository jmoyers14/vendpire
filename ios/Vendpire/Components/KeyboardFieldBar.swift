import SwiftUI

extension View {
    /// Up/down arrows and Done above the keyboard. Number pads have no return
    /// key, so this is how they're left.
    func keyboardFieldBar<Field: Hashable>(
        focus: FocusState<Field?>.Binding,
        order: [Field]
    ) -> some View {
        toolbar {
            ToolbarItemGroup(placement: .keyboard) {
                KeyboardArrow(focus: focus, order: order, offset: -1)
                KeyboardArrow(focus: focus, order: order, offset: 1)

                Spacer()

                Button("Done") { focus.wrappedValue = nil }
                    .fontWeight(.bold)
            }
        }
    }
}

/// Disabled at either end of `order`.
private struct KeyboardArrow<Field: Hashable>: View {
    let focus: FocusState<Field?>.Binding
    let order: [Field]
    let offset: Int

    private var target: Field? {
        guard let current = focus.wrappedValue, let index = order.firstIndex(of: current)
        else { return nil }

        return order.indices.contains(index + offset) ? order[index + offset] : nil
    }

    var body: some View {
        Button {
            focus.wrappedValue = target
        } label: {
            Image(systemName: offset < 0 ? "chevron.up" : "chevron.down")
        }
        .disabled(target == nil)
        .accessibilityLabel(offset < 0 ? "Previous field" : "Next field")
    }
}
