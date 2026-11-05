import SwiftData
import SwiftUI

/// One receipt line: what was scanned or picked, then its quantity and cost
/// off the receipt.
struct LineEntryView: View {
    let model: PurchaseLogModel
    let line: LineEntry

    @Environment(\.modelContext) private var context

    var body: some View {
        Form {
            Section {
                itemHeader
            }

            Section {
                LineCostFields(
                    cost: Binding(get: { line.cost }, set: { model.setPendingLineCost($0) }),
                    itemName: line.item.name,
                    extraHint: model.caseSummary(for: line.makeRow(), context: context)?.unitCostText,
                    // Qty is usually 1, so the cost is typed first.
                    focusesAmountOnAppear: true
                )
            } footer: {
                Text("Total is the line on the receipt; Each is the price of one.")
            }
        }
        .lagoonBackground()
        .pinnedFooter {
            Button("Add to purchase") { model.commitPendingLine() }
                .buttonStyle(.primaryPill)
                .disabled(!line.cost.isComplete)
        }
        .navigationTitle("Add item")
        .navigationBarTitleDisplayMode(.inline)
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
}
