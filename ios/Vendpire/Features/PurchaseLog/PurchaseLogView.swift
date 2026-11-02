import SwiftData
import SwiftUI

/// Logging a purchase: scan a cart, or pick items by name, read totals off
/// the receipt, save.
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

    /// Owned by `PurchaseSetupView`. `@Bindable` rather than a plain `let`
    /// because the receipt and notes fields still bind straight to it.
    @Bindable var model: PurchaseLogModel

    @State private var isScannerSheetPresented = false
    @State private var isAddSheetPresented = false

    var body: some View {
        Form {
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
                    .foregroundStyle(.secondaryText)
                varianceBadge
            }

            Section {
                TextField("Notes", text: $model.notes)
            }

            if let errorMessage = model.errorMessage {
                Section {
                    Text(errorMessage)
                        .foregroundStyle(.error)
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
        .lagoonBackground()
        .navigationTitle(purchaseSummary)
        .navigationBarTitleDisplayMode(.inline)
        .task {
            if let api { model.configure(api: api) }
            // The only refresh trigger in this flow — a per-item miss while
            // scanning stays silent rather than retrying behind the operator.
            await refresher.refresh()
            model.invalidateCatalog()
        }
        .sheet(
            isPresented: $isScannerSheetPresented,
            onDismiss: {
                model.resolver.dismissPendingScan()
                // Undo must not outlive the card that explains what it undoes.
                model.clearScanConfirmation()
            }
        ) {
            // The sheet stays up across scans: a resolved code just adds or
            // bumps a row and keeps scanning, and only an unknown one swaps
            // the camera for the question. A NavigationStack because the
            // create-a-case step pushes the inner flow onto it.
            NavigationStack {
                BarcodeResolutionFlow(
                    model: model.resolver,
                    confirmation: model.scanConfirmation,
                    itemCount: model.rows.count,
                    onUndo: { model.undoLastScan() }
                )
                    .toolbar {
                        // Stays reachable from the pushed inner flow too, where
                        // Back goes up one level and this leaves entirely.
                        ToolbarItem(placement: .cancellationAction) {
                            Button("Cancel") { isScannerSheetPresented = false }
                        }
                    }
            }
            // On the sheet's root, where presentation modifiers take effect —
            // a per-branch detent pinned the sheet to the camera's height.
            .presentationDetents([.large])
        }
        .sheet(isPresented: $isAddSheetPresented) {
            AddCatalogItemSheet(model: model)
        }
    }

    /// "Costco · Oct 30" — a plain title, not a button: Back is the one way to
    /// change it.
    private var purchaseSummary: String {
        let day = model.purchasedDate.formatted(.dateTime.month(.abbreviated).day())
        return "\(model.vendor) · \(day)"
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
            rowNameLine(row)

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
                    .foregroundStyle(.secondaryText)
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

    /// A `.packDraft` row is the one kind that navigates: tapping its name
    /// reopens `CaseContentsView` until the case is finally created.
    @ViewBuilder
    private func rowNameLine(_ row: PurchaseRow) -> some View {
        if row.kind == .packDraft, let draftResolver = model.packDrafts[row.recordId] {
            NavigationLink {
                CaseContentsView(resolver: draftResolver)
            } label: {
                HStack(spacing: 8) {
                    KindBadge(isPack: true)
                    Text(row.name)
                    Pill("Add contents", tone: .warning)
                }
            }
        } else {
            HStack(spacing: 8) {
                KindBadge(isPack: row.isPack)
                Text(row.name)
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
                    .foregroundStyle(.success)
            } else if variance > 0 {
                Label("Over by \(Money.formatCents(variance))", systemImage: "arrow.up.circle.fill")
                    .foregroundStyle(.warning)
            } else {
                Label("Under by \(Money.formatCents(-variance))", systemImage: "arrow.down.circle.fill")
                    .foregroundStyle(.error)
            }
        }
    }
}

/// "Add without scanning": the name-filtered catalog list the not-found sheet
/// uses to attach a code, reused to add a row with no code involved.
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
            .lagoonBackground()
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
        let trimmedQuery = query.trimmed
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
