import SwiftUI

/// Qty, $, the Total | Each switch, and the hint under them — the receipt
/// line as typed, shared by Entry and a new case. Rows for a `Section`.
struct LineCostFields: View {
    @Binding var cost: LineCost
    /// For VoiceOver, which can't see which item the fields belong to.
    let itemName: String
    /// Joined onto the counterpart, e.g. a case's "$0.54 / unit".
    var extraHint: String?
    var focusesAmountOnAppear = false

    private enum Field: Hashable {
        case quantity
        case amount
    }

    @FocusState private var focusedField: Field?

    var body: some View {
        HStack(alignment: .top, spacing: 12) {
            BoxedField(
                label: "Qty",
                accessibilityLabel: "Quantity of \(itemName)",
                text: $cost.quantityText,
                keyboard: .numberPad,
                focus: $focusedField,
                field: .quantity
            )
            .frame(width: 116)

            Spacer(minLength: 0)

            BoxedField(
                label: "$",
                accessibilityLabel: cost.mode == .total
                    ? "Total cost for \(itemName)"
                    : "Cost of each \(itemName)",
                text: $cost.amountText,
                placeholder: "0.00",
                focus: $focusedField,
                field: .amount
            )
            .frame(width: 132)
        }
        .onAppear {
            if focusesAmountOnAppear { focusedField = .amount }
        }

        Picker("Cost is", selection: $cost.mode) {
            Text("Total").tag(LineCost.Mode.total)
            Text("Each").tag(LineCost.Mode.each)
        }
        .pickerStyle(.segmented)

        if let hint {
            Text(hint)
                .font(.footnote.monospacedDigit())
                .foregroundStyle(.secondaryText)
                .frame(maxWidth: .infinity, alignment: .trailing)
        }
    }

    private var hint: String? {
        let counterpart = cost.counterpartCents.map {
            "= \(Money.formatCents($0)) \(cost.mode == .total ? "each" : "total")"
        }
        let parts = [counterpart, extraHint].compactMap { $0 }
        return parts.isEmpty ? nil : parts.joined(separator: " · ")
    }
}
