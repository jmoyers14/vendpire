import SwiftData
import SwiftUI

/// What's inside a new case. "Add to purchase" creates it and puts its line
/// on the list.
struct CaseContentsView: View {
    let purchase: PurchaseLogModel

    @Environment(\.modelContext) private var context

    @State private var isAddingContent = false
    @State private var isWorking = false
    @FocusState private var focusedContent: UUID?

    /// One `navigationDestination` per level, so the camera and the search
    /// share a slot.
    private enum Destination: Hashable {
        case scanner
        case search
    }

    private var resolver: BarcodeResolutionModel { purchase.resolver }

    var body: some View {
        List {
            ResolverErrorSection(model: resolver)

            ScanOrAddRow(
                addTitle: "Add",
                onScan: { resolver.beginContentResolution(through: .scanner) },
                onAdd: { isAddingContent = true }
            )

            Section {
                if resolver.contents.isEmpty {
                    EmptyStateCard(
                        systemImage: "shippingbox",
                        title: "What's inside?",
                        message: "Scan a bag from inside the case, or add it by name, then enter how many of it one case holds."
                    )
                } else {
                    ForEach(resolver.contents) { content in
                        contentRow(content)
                    }
                }
            } header: {
                SectionTitle("In one case", productCount: resolver.contents.count)
            }
        }
        .listStyle(.insetGrouped)
        .lagoonBackground()
        .scrollDismissesKeyboard(.interactively)
        .keyboardFieldBar(focus: $focusedContent, order: resolver.contents.map(\.id))
        .pinnedFooter {
            Button(action: submit) {
                if isWorking {
                    ProgressView()
                        .tint(.white)
                } else {
                    Text("Add to purchase")
                }
            }
            .buttonStyle(.primaryPill)
            .disabled(isWorking)
        }
        .navigationTitle("Case contents")
        .navigationBarTitleDisplayMode(.inline)
        .navigationDestination(item: destination) { pushed in
            switch pushed {
            case .scanner:
                if let inner = resolver.contentResolver {
                    BarcodeResolutionFlow(model: inner)
                }
            case .search:
                CaseContentSearch(resolver: resolver, onPick: { isAddingContent = false })
            }
        }
        // A product created from the search lands here, not back on the search.
        .onChange(of: resolver.contents.count) { _, _ in
            isAddingContent = false
        }
    }

    private var destination: Binding<Destination?> {
        Binding(
            get: {
                if resolver.contentDoor == .scanner { return .scanner }
                return isAddingContent ? .search : nil
            },
            set: { pushed in
                guard pushed == nil else { return }
                if resolver.contentDoor == .scanner { resolver.endContentResolution() }
                isAddingContent = false
            }
        )
    }

    private func contentRow(_ content: BarcodeResolutionModel.PackContentDraft) -> some View {
        HStack(spacing: 12) {
            Text(content.name)
                .font(.headline)
                .foregroundStyle(.heading)
                .lineLimit(2)

            Spacer(minLength: 0)

            BoxedField(
                label: "Units",
                accessibilityLabel: "Units of \(content.name) in one case",
                text: Binding(
                    get: { content.unitsText },
                    set: { resolver.updateContent(id: content.id, unitsText: $0) }
                ),
                keyboard: .numberPad,
                focus: $focusedContent,
                field: content.id
            )
            .frame(width: 116)
        }
        .padding(.vertical, 8)
        .listRowBackground(focusedContent == content.id ? Color.actionSoft : Color.card)
        .swipeActions {
            Button(role: .destructive) {
                resolver.removeContent(id: content.id)
            } label: {
                Label("Delete", systemImage: "trash")
            }
        }
    }

    /// Success closes the sheet; a failure leaves this screen up to retry.
    private func submit() {
        focusedContent = nil
        isWorking = true
        Task {
            await purchase.addNewCase(context: context)
            isWorking = false
        }
    }
}

/// "Add" on the case: a product already in the catalog, or a new one for a
/// bag with no barcode of its own.
private struct CaseContentSearch: View {
    let resolver: BarcodeResolutionModel
    let onPick: () -> Void

    @Environment(\.modelContext) private var context

    var body: some View {
        CatalogSearchForm(
            prompt: "Search your products…",
            emptyText: "Nothing matches — create it below.",
            results: { resolver.searchResults(query: $0, context: context, includingPacks: false) },
            onSelect: { item in
                resolver.addContent(item)
                onPick()
            }
        ) {
            Section {
                Button("Create a new product") {
                    resolver.beginContentResolution(through: .blankCreate)
                }
            } footer: {
                Text("For a bag with no barcode of its own.")
            }
        }
        .navigationTitle("Add to the case")
        .navigationBarTitleDisplayMode(.inline)
        .navigationDestination(isPresented: blankCreateBinding) {
            if let inner = resolver.contentResolver {
                BarcodeResolutionFlow(model: inner, startsBlank: true)
            }
        }
    }

    private var blankCreateBinding: Binding<Bool> {
        Binding(
            get: { resolver.contentDoor == .blankCreate },
            set: { isPresented in
                if !isPresented { resolver.endContentResolution() }
            }
        )
    }
}
