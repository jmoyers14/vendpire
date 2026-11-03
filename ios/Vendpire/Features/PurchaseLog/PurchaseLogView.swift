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
    /// The `recordId` of the draft case whose contents are open.
    @State private var draftShowingContents: String?
    @State private var isKeyboardVisible = false

    var body: some View {
        // A List rather than a ScrollView: its sections already read as
        // Lagoon cards, and swipe-to-delete only exists inside one.
        List {
            Section {
                HStack(spacing: 12) {
                    scanButton
                    Button {
                        isAddSheetPresented = true
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

            Section {
                receiptFields
            } header: {
                sectionTitle("Receipt")
            }
        }
        .listStyle(.insetGrouped)
        .lagoonBackground()
        // Number pads have no dismiss key, and Save hides behind the keyboard.
        .scrollDismissesKeyboard(.interactively)
        .toolbar {
            ToolbarItemGroup(placement: .keyboard) {
                Spacer()
                Button("Done") { dismissKeyboard() }
                    .fontWeight(.bold)
            }
        }
        .safeAreaInset(edge: .bottom, spacing: 0) {
            // An inset rides up on top of the keyboard, where it would cover
            // the field being typed in.
            if !isKeyboardVisible {
                footer
            }
        }
        .onReceive(NotificationCenter.default.publisher(for: UIResponder.keyboardWillShowNotification)) { _ in
            isKeyboardVisible = true
        }
        .onReceive(NotificationCenter.default.publisher(for: UIResponder.keyboardWillHideNotification)) { _ in
            isKeyboardVisible = false
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
        .navigationDestination(item: $draftShowingContents) { draftId in
            if let resolver = model.packDrafts[draftId] {
                CaseContentsView(resolver: resolver)
            }
        }
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
            isScannerSheetPresented = true
        } label: {
            Label("Scan", systemImage: "barcode.viewfinder")
        }
        .buttonStyle(.primaryPill)
        .disabled(!BarcodeScannerView.isSupported)
        .accessibilityHint(BarcodeScannerView.isSupported ? "" : "Scanning needs a device camera")
    }

    // MARK: - Sections

    private func sectionTitle(_ title: String) -> some View {
        Text(title)
            .font(.title3.bold())
            .foregroundStyle(.heading)
            .textCase(nil)
    }

    private var itemsHeader: some View {
        HStack(alignment: .firstTextBaseline) {
            sectionTitle("Items")
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
            Text("Scan each product's barcode, or add it by name. You'll enter quantity and cost for each one.")
                .font(.body)
                .foregroundStyle(.bodyText)
                .multilineTextAlignment(.center)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 24)
    }

    /// One row, so the total and notes share a card without a divider.
    private var receiptFields: some View {
        VStack(alignment: .leading, spacing: 16) {
            HStack(spacing: 12) {
                Text("Receipt total")
                    .font(.body.bold())
                    .foregroundStyle(.heading)
                Spacer()
                BoxedField(label: "$", text: $model.receiptTotalText, placeholder: "0.00")
                    .frame(width: 132)
            }

            VStack(alignment: .leading, spacing: 6) {
                Text("Notes")
                    .font(.subheadline.bold())
                    .foregroundStyle(.heading)
                TextField("Bought extra for the gym machine", text: $model.notes, axis: .vertical)
                    .lineLimit(2...5)
                    .foregroundStyle(.heading)
                    .padding(.horizontal, 12)
                    .padding(.vertical, 10)
                    .overlay(
                        RoundedRectangle(cornerRadius: LagoonRadius.field, style: .continuous)
                            .strokeBorder(.fieldBorder)
                    )
            }
        }
        .padding(.vertical, 8)
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
                        text: Binding(
                            get: { row.quantityText },
                            set: { model.updateRow(id: row.id, quantityText: $0) }
                        ),
                        keyboard: .numberPad
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
                        text: Binding(
                            get: { row.totalCostText },
                            set: { model.updateRow(id: row.id, totalCostText: $0) }
                        ),
                        placeholder: "0.00"
                    )
                    .frame(width: 132)
                    if let unitCostCents = summary?.unitCostCents {
                        Text("\(Money.formatCents(unitCostCents)) / unit")
                            .font(.footnote.monospacedDigit())
                            .foregroundStyle(.secondaryText)
                            .padding(.trailing, 2)
                    }
                }
            }
        }
        .padding(.vertical, 8)
        .swipeActions {
            Button(role: .destructive) {
                model.removeRow(id: row.id)
            } label: {
                Label("Delete", systemImage: "trash")
            }
        }
    }

    /// Kind, then what's in a case: its unit count, or — for a case still being
    /// created — the way back into `CaseContentsView`.
    private func badgeLine(_ row: PurchaseRow, summary: CaseSummary?) -> some View {
        HStack(spacing: 8) {
            KindBadge(isPack: row.isPack)

            if row.kind == .packDraft {
                Button {
                    draftShowingContents = row.recordId
                } label: {
                    Pill("Add contents", tone: .warning)
                }
                .buttonStyle(.borderless)
            } else if let summary {
                Text("^[\(summary.unitsPerCase) unit](inflect: true)")
                    .font(.subheadline)
                    .foregroundStyle(.secondaryText)
            }

            Spacer(minLength: 0)

            if row.kind == .packDraft {
                Button {
                    draftShowingContents = row.recordId
                } label: {
                    Image(systemName: "chevron.right")
                        .font(.footnote.bold())
                        .foregroundStyle(.fieldBorder)
                        .frame(width: 32, height: 32)
                }
                .buttonStyle(.borderless)
                .accessibilityLabel("Case contents")
            }
        }
        .frame(minHeight: 26)
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

    /// Each `BoxedField` owns its focus, so there is no shared `FocusState` to
    /// clear yet; resigning the first responder reaches whichever is active.
    private func dismissKeyboard() {
        UIApplication.shared.sendAction(
            #selector(UIResponder.resignFirstResponder), to: nil, from: nil, for: nil
        )
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
