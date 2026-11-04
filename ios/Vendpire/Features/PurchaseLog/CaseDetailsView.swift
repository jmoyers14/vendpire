import SwiftData
import SwiftUI

/// A finished case on the purchase, read-only: what one case holds, and how
/// this line's cost will split across those products when the server expands
/// it. Drafts go to `CaseContentsView` instead, which edits.
struct CaseDetailsView: View {
    let model: PurchaseLogModel
    let rowId: UUID

    @Environment(\.modelContext) private var context

    var body: some View {
        List {
            if let row = model.rows.first(where: { $0.id == rowId }) {
                sections(for: row)
            }
        }
        .listStyle(.insetGrouped)
        .lagoonBackground()
        .navigationTitle("Case details")
        .navigationBarTitleDisplayMode(.inline)
    }

    @ViewBuilder
    private func sections(for row: PurchaseRow) -> some View {
        let contents = model.caseContents(for: row, context: context) ?? []
        let unitsPerCase = model.caseSummary(for: row, context: context)?.unitsPerCase ?? 0

        Section {
            VStack(alignment: .leading, spacing: 4) {
                Text(row.name)
                    .font(.headline)
                    .foregroundStyle(.heading)
                Text("^[\(unitsPerCase) unit](inflect: true) per case")
                    .font(.subheadline)
                    .foregroundStyle(.secondaryText)
            }
            .padding(.vertical, 4)
        }

        Section {
            ForEach(Array(contents.enumerated()), id: \.offset) { _, content in
                valueRow(content.name, value: "\(content.unitsPerCase)")
            }
        } header: {
            SectionTitle("Inside one case")
        }

        splitSection(for: row)
    }

    /// The same allocator the server runs, so these are the numbers it stores.
    @ViewBuilder
    private func splitSection(for row: PurchaseRow) -> some View {
        Section {
            if let split = model.splitPreview(for: row, context: context) {
                ForEach(Array(split.enumerated()), id: \.offset) { _, share in
                    valueRow("\(share.units) × \(share.name)", value: Money.formatCents(share.cents))
                }
            } else {
                Text("Enter a quantity and cost on the purchase to see how they split.")
                    .foregroundStyle(.secondaryText)
            }
        } header: {
            SectionTitle("How this line saves")
        } footer: {
            Text("Each product's share becomes its cost per unit.")
                .foregroundStyle(.secondaryText)
        }
    }

    private func valueRow(_ title: String, value: String) -> some View {
        HStack {
            Text(title)
                .foregroundStyle(.heading)
            Spacer()
            Text(value)
                .monospacedDigit()
                .foregroundStyle(.bodyText)
        }
    }
}
