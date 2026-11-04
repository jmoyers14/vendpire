import SwiftData
import SwiftUI

/// Logging a purchase one receipt line at a time: Scan or Add manually opens
/// a sheet that ends on Entry, Add puts the line here, repeat, save.
///
/// Opens on Scan. Vendor and date are already settled by `PurchaseSetupView`,
/// which owns the model and pushes this — so Back is how they get corrected,
/// and the pair stays in view as this screen's title.
///
/// Layout only: every rule lives in `PurchaseLogModel`, where tests reach it.
struct PurchaseLogView: View {
    @Environment(\.modelContext) private var context
    @Environment(\.dismiss) private var dismiss
    @Environment(MirrorRefresher.self) private var refresher
    @Environment(\.vendpireAPI) private var api

    /// Owned by `PurchaseSetupView`, which also takes the receipt total and
    /// notes before this screen opens.
    let model: PurchaseLogModel

    @State private var lineSheetStart: PurchaseLineSheet.Start?
    /// The row id of the case whose details are open.
    @State private var caseShowingDetails: UUID?
    /// Shared by every field, so the keyboard's arrows can walk between them.
    @FocusState private var focusedField: PurchaseField?

    var body: some View {
        // A List rather than a ScrollView: its sections already read as
        // Lagoon cards, and swipe-to-delete only exists inside one.
        ScrollViewReader { proxy in
            List {
                Section {
                    HStack(spacing: 12) {
                        scanButton
                        Button {
                            lineSheetStart = .search
                        } label: {
                            Label("Add manually", systemImage: "plus")
                        }
                        .buttonStyle(.softPill)
                    }
                    .listRowBackground(Color.clear)
                    .listRowInsets(EdgeInsets())
                }

                Section {
                    if model.rows.isEmpty {
                        emptyItems
                    } else {
                        ForEach(model.rows) { row in
                            rowView(row)
                        }
                    }
                } header: {
                    itemsHeader
                }
            }
            // The arrows can land on a field below the fold.
            .onChange(of: focusedField) { _, field in
                guard let field else { return }
                withAnimation {
                    proxy.scrollTo(field.rowId)
                }
            }
        }
        .listStyle(.insetGrouped)
        .lagoonBackground()
        // Number pads have no dismiss key, and Save hides behind the keyboard.
        .scrollDismissesKeyboard(.interactively)
        .toolbar {
            ToolbarItemGroup(placement: .keyboard) {
                arrowButton(to: focusedField.flatMap { model.field(before: $0) },
                            systemImage: "chevron.up", label: "Previous field")
                arrowButton(to: focusedField.flatMap { model.field(after: $0) },
                            systemImage: "chevron.down", label: "Next field")

                Spacer()

                Button("Done") { focusedField = nil }
                    .fontWeight(.bold)
            }
        }
        .safeAreaInset(edge: .bottom, spacing: 0) {
            // An inset rides up on top of the keyboard, where it would cover
            // the field being typed in.
            if focusedField == nil {
                footer
            }
        }
        .navigationTitle(purchaseSummary)
        .navigationBarTitleDisplayMode(.inline)
        .task {
            if let api { model.configure(api: api) }
            // The only refresh trigger in this flow — a per-item miss while
            // scanning stays silent rather than retrying behind the operator.
            await refresher.refresh()
            model.invalidateCatalog()
        }
        .sheet(item: $lineSheetStart, onDismiss: model.cancelPendingLine) { start in
            PurchaseLineSheet(model: model, start: start)
        }
        .navigationDestination(item: $caseShowingDetails) { rowId in
            CaseDetailsView(model: model, rowId: rowId)
        }
    }

    /// A keyboard arrow, disabled at either end of the fields.
    private func arrowButton(to target: PurchaseField?, systemImage: String, label: String) -> some View {
        Button {
            focusedField = target
        } label: {
            Image(systemName: systemImage)
        }
        .disabled(target == nil)
        .accessibilityLabel(label)
    }

    /// "Costco · Oct 30" — a plain title, not a button: Back is the one way to
    /// change it.
    private var purchaseSummary: String {
        let day = model.purchasedDate.formatted(.dateTime.month(.abbreviated).day())
        return "\(model.vendor) · \(day)"
    }

    // MARK: - Scan

    /// Disabled without a camera — only the Simulator, in practice.
    private var scanButton: some View {
        Button {
            lineSheetStart = .scan
        } label: {
            Label("Scan", systemImage: "barcode.viewfinder")
        }
        .buttonStyle(.primaryPill)
        .disabled(!BarcodeScannerView.isSupported)
        .accessibilityHint(BarcodeScannerView.isSupported ? "" : "Scanning needs a device camera")
    }

    // MARK: - Sections

    private var itemsHeader: some View {
        HStack(alignment: .firstTextBaseline) {
            SectionTitle("Items")
            Spacer()
            if !model.rows.isEmpty {
                Text("^[\(model.rows.count) product](inflect: true)")
                    .font(.subheadline)
                    .foregroundStyle(.secondaryText)
                    .textCase(nil)
            }
        }
    }

    private var emptyItems: some View {
        VStack(spacing: 8) {
            Image(systemName: "barcode.viewfinder")
                .font(.title2)
                .foregroundStyle(.bodyText)
                .frame(width: 52, height: 52)
                .background(.divider, in: Circle())
                .padding(.bottom, 4)
            Text("Add what you bought")
                .font(.headline)
                .foregroundStyle(.heading)
            Text("Scan a product's barcode, or add it by name, then enter its quantity and cost from the receipt.")
                .font(.body)
                .foregroundStyle(.bodyText)
                .multilineTextAlignment(.center)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 24)
    }

    // MARK: - Rows

    private func rowView(_ row: PurchaseRow) -> some View {
        let summary = model.caseSummary(for: row, context: context)

        return VStack(alignment: .leading, spacing: 0) {
            badgeLine(row, summary: summary)

            Text(row.name)
                .font(.headline)
                .foregroundStyle(.heading)
                .padding(.top, 8)
                .padding(.bottom, 12)

            HStack(alignment: .top, spacing: 12) {
                VStack(alignment: .leading, spacing: 4) {
                    BoxedField(
                        label: "Qty",
                        accessibilityLabel: "Quantity of \(row.name)",
                        text: Binding(
                            get: { row.quantityText },
                            set: { model.updateRow(id: row.id, quantityText: $0) }
                        ),
                        keyboard: .numberPad,
                        focus: $focusedField,
                        field: .quantity(rowId: row.id)
                    )
                    .frame(width: 116)
                    Text(quantityNoun(row))
                        .font(.subheadline)
                        .foregroundStyle(.secondaryText)
                        .padding(.leading, 2)
                }

                Spacer(minLength: 0)

                VStack(alignment: .trailing, spacing: 4) {
                    BoxedField(
                        label: "$",
                        accessibilityLabel: "Total cost for \(row.name)",
                        text: Binding(
                            get: { row.totalCostText },
                            set: { model.updateRow(id: row.id, totalCostText: $0) }
                        ),
                        placeholder: "0.00",
                        focus: $focusedField,
                        field: .totalCost(rowId: row.id)
                    )
                    .frame(width: 132)
                    if let hint = costHint(row, summary: summary) {
                        Text(hint)
                            .font(.footnote.monospacedDigit())
                            .foregroundStyle(.secondaryText)
                            .padding(.trailing, 2)
                    }
                }
            }
        }
        .padding(.vertical, 8)
        .listRowBackground(focusedField?.rowId == row.id ? Color.actionSoft : Color.card)
        .swipeActions {
            Button(role: .destructive) {
                model.removeRow(id: row.id)
            } label: {
                Label("Delete", systemImage: "trash")
            }
        }
    }

    /// Kind, then a case's unit count and the way into its details.
    private func badgeLine(_ row: PurchaseRow, summary: CaseSummary?) -> some View {
        HStack(spacing: 8) {
            KindBadge(isPack: row.isPack)

            if let summary {
                Text("^[\(summary.unitsPerCase) unit](inflect: true)")
                    .font(.subheadline)
                    .foregroundStyle(.secondaryText)
            }

            Spacer(minLength: 0)

            if summary != nil {
                Button {
                    caseShowingDetails = row.id
                } label: {
                    Image(systemName: "chevron.right")
                        .font(.footnote.bold())
                        .foregroundStyle(.fieldBorder)
                        .frame(width: 32, height: 32)
                }
                .buttonStyle(.borderless)
                .accessibilityLabel("Case details")
            }
        }
        .frame(minHeight: 26)
    }

    /// Under the line total: "$12.99 each" (or "/ case") past qty 1, and a
    /// single-product case's "$0.54 / unit" at any qty.
    private func costHint(_ row: PurchaseRow, summary: CaseSummary?) -> String? {
        var parts: [String] = []
        if let eachCents = model.eachCents(for: row) {
            parts.append("\(Money.formatCents(eachCents)) \(row.isPack ? "/ case" : "each")")
        }
        if let unitCostCents = summary?.unitCostCents {
            parts.append("\(Money.formatCents(unitCostCents)) / unit")
        }
        return parts.isEmpty ? nil : parts.joined(separator: " · ")
    }

    /// "case" under a quantity of one, "cases" under anything else.
    private func quantityNoun(_ row: PurchaseRow) -> String {
        let isSingular = Int(row.quantityText.trimmed) == 1
        switch (row.isPack, isSingular) {
        case (true, true): return "case"
        case (true, false): return "cases"
        case (false, true): return "item"
        case (false, false): return "items"
        }
    }

    // MARK: - Footer

    /// Pinned under the list: the totals the operator reconciles against the
    /// paper receipt, any save error, and Save. Empty, it holds only Save.
    private var footer: some View {
        VStack(spacing: 12) {
            if let errorMessage = model.errorMessage {
                Text(errorMessage)
                    .font(.subheadline)
                    .foregroundStyle(.error)
                    .frame(maxWidth: .infinity, alignment: .leading)
            }

            if !model.rows.isEmpty {
                HStack(spacing: 24) {
                    footerTotal("Items", cents: model.enteredCents)
                    if let receiptTotalCents = model.receiptTotalCents {
                        footerTotal("Receipt", cents: receiptTotalCents)
                    }
                    Spacer(minLength: 0)
                    receiptStatusPill
                }
            }

            Button("Save purchase") {
                if model.save(context: context) { dismiss() }
            }
            .buttonStyle(.primaryPill)
        }
        .padding(.horizontal, 16)
        .padding(.top, 12)
        .padding(.bottom, 8)
        .background(.card)
        .overlay(alignment: .top) {
            Rectangle()
                .fill(.line)
                .frame(height: 1)
        }
    }

    private func footerTotal(_ label: String, cents: Int) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            Text(label)
                .font(.subheadline)
                .foregroundStyle(.secondaryText)
            Text(Money.formatCents(cents))
                .font(.title3.bold().monospacedDigit())
                .foregroundStyle(.heading)
        }
    }

    @ViewBuilder
    private var receiptStatusPill: some View {
        switch model.receiptStatus {
        case .matches:
            Pill("Matches", tone: .success)
        case .unaccounted(let cents):
            Pill("\(Money.formatCents(cents)) unaccounted", tone: .warning)
        case .overReceipt(let cents):
            Pill("\(Money.formatCents(cents)) over receipt", tone: .warning)
        case nil:
            EmptyView()
        }
    }
}
