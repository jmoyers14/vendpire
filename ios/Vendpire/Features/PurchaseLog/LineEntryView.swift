import SwiftData
import SwiftUI

/// One receipt line: what was scanned or picked, then its quantity and cost
/// read off the receipt. Add puts it on the purchase and closes the sheet.
///
/// Layout only: the arithmetic is `LineEntry`'s, the rest `PurchaseLogModel`'s.
struct LineEntryView: View {
    let model: PurchaseLogModel
    let line: LineEntry
    let onAdd: () -> Void

    @Environment(\.modelContext) private var context

    private enum Field: Hashable {
        case quantity
        case amount
    }

    @FocusState private var focusedField: Field?

    var body: some View {
        Form {
            Section {
                itemHeader
            }

            Section {
                HStack(alignment: .top, spacing: 12) {
                    BoxedField(
                        label: "Qty",
                        accessibilityLabel: "Quantity of \(line.item.name)",
                        text: Binding(
                            get: { line.quantityText },
                            set: { model.updatePendingLine(quantityText: $0) }
                        ),
                        keyboard: .numberPad,
                        focus: $focusedField,
                        field: .quantity
                    )
                    .frame(width: 116)

                    Spacer(minLength: 0)

                    BoxedField(
                        label: "$",
                        accessibilityLabel: line.mode == .total
                            ? "Total cost for \(line.item.name)"
                            : "Cost of each \(line.item.name)",
                        text: Binding(
                            get: { line.amountText },
                            set: { model.updatePendingLine(amountText: $0) }
                        ),
                        placeholder: "0.00",
                        focus: $focusedField,
                        field: .amount
                    )
                    .frame(width: 132)
                }

                Picker("Cost is", selection: Binding(
                    get: { line.mode },
                    set: { model.updatePendingLine(mode: $0) }
                )) {
                    Text("Total").tag(LineEntry.CostEntryMode.total)
                    Text("Each").tag(LineEntry.CostEntryMode.each)
                }
                .pickerStyle(.segmented)

                if let hint {
                    Text(hint)
                        .font(.footnote.monospacedDigit())
                        .foregroundStyle(.secondaryText)
                        .frame(maxWidth: .infinity, alignment: .trailing)
                }
            } footer: {
                Text("Total is the line on the receipt; Each is the price of one.")
            }
        }
        .lagoonBackground()
        // Rides above the keyboard, so Add is under the thumb that just typed.
        .safeAreaInset(edge: .bottom, spacing: 0) {
            Button("Add to purchase", action: onAdd)
                .buttonStyle(.primaryPill)
                .disabled(!line.isComplete)
                .padding(.horizontal, 16)
                .padding(.vertical, 8)
                .background(.card)
        }
        .navigationTitle("Add item")
        .navigationBarTitleDisplayMode(.inline)
        // Qty is usually 1, so the cost is what gets typed first.
        .onAppear { focusedField = .amount }
    }

    private var itemHeader: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 8) {
                KindBadge(isPack: line.item.isPack)
                if case .pack(let units) = line.item.kind {
                    Text("^[\(units) unit](inflect: true)")
                        .font(.subheadline)
                        .foregroundStyle(.secondaryText)
                }
            }
            Text(line.item.name)
                .font(.headline)
                .foregroundStyle(.heading)
            if let existing = model.existingLine(for: line.item) {
                Text("Already on this purchase: \(existingSummary(existing))")
                    .font(.footnote)
                    .foregroundStyle(.secondaryText)
            }
        }
        .padding(.vertical, 4)
    }

    /// "1 × $12.99", or just the quantity while that line's cost is blank.
    private func existingSummary(_ row: PurchaseRow) -> String {
        let quantity = row.quantityText.trimmed
        guard let cents = Money.parseDollarsToCents(row.totalCostText) else { return "\(quantity) ×" }
        return "\(quantity) × \(Money.formatCents(cents))"
    }

    /// The number not typed, and a single-product case's per-unit cost.
    private var hint: String? {
        var parts: [String] = []
        if let counterpartCents = line.counterpartCents {
            let formatted = Money.formatCents(counterpartCents)
            parts.append(line.mode == .total ? "= \(formatted) each" : "= \(formatted) total")
        }
        if let unitCostCents = model.caseSummary(for: line.makeRow(), context: context)?.unitCostCents {
            parts.append("\(Money.formatCents(unitCostCents)) / unit")
        }
        return parts.isEmpty ? nil : parts.joined(separator: " · ")
    }
}
