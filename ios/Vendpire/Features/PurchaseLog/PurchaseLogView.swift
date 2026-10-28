import SwiftData
import SwiftUI

/// Logging a purchase: scan a cart, or pick items by name, read totals off
/// the receipt, save.
///
/// Layout only: every rule lives in `PurchaseLogModel`, where tests reach it.
struct PurchaseLogView: View {
    @Environment(\.modelContext) private var context
    @Environment(\.dismiss) private var dismiss
    @Environment(MirrorRefresher.self) private var refresher
    @Environment(\.vendpireAPI) private var api

    @State private var model = PurchaseLogModel()
    @State private var isScannerSheetPresented = false
    @State private var isAddSheetPresented = false

    var body: some View {
        Form {
            Section {
                DatePicker("Date", selection: $model.purchasedDate, displayedComponents: .date)
                TextField("Vendor", text: $model.vendor)
            }

            Section {
                scanButton
                Button("Add without scanning") { isAddSheetPresented = true }
            }

            if !model.rows.isEmpty {
                Section("Items") {
                    ForEach(model.rows) { row in
                        rowView(row)
                    }
                }
            }

            Section("Receipt") {
                TextField("Receipt total $", text: $model.receiptTotalText)
                    .keyboardType(.decimalPad)
                Text("Entered: \(Money.formatCents(model.enteredCents))")
                    .foregroundStyle(.secondary)
                varianceBadge
            }

            Section {
                TextField("Notes", text: $model.notes)
            }

            if let errorMessage = model.errorMessage {
                Section {
                    Text(errorMessage)
                        .foregroundStyle(.red)
                }
            }

            Section {
                Button {
                    if model.save(context: context) { dismiss() }
                } label: {
                    Text("Save Purchase")
                        .frame(maxWidth: .infinity)
                }
                .buttonStyle(.borderedProminent)
            }
        }
        .navigationTitle("Log Purchase")
        .navigationBarTitleDisplayMode(.inline)
        .task {
            if let api { model.configure(api: api) }
            // The only refresh trigger in this flow — a per-item miss while
            // scanning stays silent rather than retrying behind the operator.
            await refresher.refresh()
            model.catalogDidChange()
        }
        .sheet(isPresented: $isScannerSheetPresented, onDismiss: { model.dismissPendingScan() }) {
            // The sheet stays up across scans: a resolved code just adds or
            // bumps a row and keeps scanning, and only an unknown one swaps
            // this content for the not-found sheet.
            if model.pendingScan != nil {
                BarcodeNotFoundSheet(model: model)
            } else {
                BarcodeScannerView(onScan: { code in model.handleScan(code, context: context) })
                    .presentationDetents([.medium])
            }
        }
        .sheet(isPresented: $isAddSheetPresented) {
            AddCatalogItemSheet(model: model)
        }
    }

    // MARK: - Scan

    @ViewBuilder
    private var scanButton: some View {
        if BarcodeScannerView.isSupported {
            Button {
                isScannerSheetPresented = true
            } label: {
                Label("Scan", systemImage: "barcode.viewfinder")
            }
        } else {
            Button("Scanning needs a device camera") {}
                .disabled(true)
        }
    }

    // MARK: - Rows

    private func rowView(_ row: PurchaseRow) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            HStack(spacing: 8) {
                KindBadge(isPack: row.isPack)
                Text(row.name)
            }

            HStack(spacing: 12) {
                TextField(
                    row.isPack ? "Cases" : "Units",
                    text: Binding(
                        get: { row.quantityText },
                        set: { model.updateRow(id: row.id, quantityText: $0) }
                    )
                )
                .keyboardType(.numberPad)
                .frame(width: 70)

                TextField(
                    "Total cost $",
                    text: Binding(
                        get: { row.totalCostText },
                        set: { model.updateRow(id: row.id, totalCostText: $0) }
                    )
                )
                .keyboardType(.decimalPad)
            }

            if let preview = model.splitPreview(for: row, context: context) {
                Text(splitPreviewText(preview))
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
        }
        .swipeActions {
            Button(role: .destructive) {
                model.removeRow(id: row.id)
            } label: {
                Label("Delete", systemImage: "trash")
            }
        }
    }

    /// "↳ saves as 20 × Lays ($25.32) · 10 × Fritos ($12.66)" — what the pack
    /// row's cost becomes once the server expands it, previewed with the same
    /// allocator that will actually run.
    private func splitPreviewText(_ preview: [(name: String, units: Int, cents: Int)]) -> String {
        let parts = preview.map { "\($0.units) × \($0.name) (\(Money.formatCents($0.cents)))" }
        return "↳ saves as \(parts.joined(separator: " · "))"
    }

    // MARK: - Receipt reconciliation

    @ViewBuilder
    private var varianceBadge: some View {
        if let variance = model.varianceCents {
            if variance == 0 {
                Label("Matches receipt", systemImage: "checkmark.circle.fill")
                    .foregroundStyle(.green)
            } else if variance > 0 {
                Label("Over by \(Money.formatCents(variance))", systemImage: "arrow.up.circle.fill")
                    .foregroundStyle(.orange)
            } else {
                Label("Under by \(Money.formatCents(-variance))", systemImage: "arrow.down.circle.fill")
                    .foregroundStyle(.red)
            }
        }
    }
}

/// "Add without scanning": the same name-filtered catalog list Task 16's
/// not-found sheet uses to attach a code, reused here to add a row with no
/// code involved at all.
private struct AddCatalogItemSheet: View {
    let model: PurchaseLogModel

    @Environment(\.modelContext) private var context
    @Environment(\.dismiss) private var dismiss

    @State private var query = ""

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    TextField("Search your products and cases…", text: $query)
                        .autocorrectionDisabled()
                    matches
                }
            }
            .navigationTitle("Add an item")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
            }
        }
        .presentationDetents([.large])
    }

    @ViewBuilder
    private var matches: some View {
        let trimmedQuery = query.trimmingCharacters(in: .whitespacesAndNewlines)
        if !trimmedQuery.isEmpty {
            CatalogItemMatches(
                items: model.searchResults(query: query, context: context),
                isDisabled: false,
                emptyText: "Nothing matches.",
                onSelect: { item in
                    model.add(item)
                    dismiss()
                }
            )
        }
    }
}
