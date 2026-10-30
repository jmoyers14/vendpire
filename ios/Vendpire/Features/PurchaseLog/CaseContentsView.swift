import SwiftData
import SwiftUI

/// Filling in what's inside a case already sitting on the purchase as a
/// draft row — reached by tapping that row, any number of times, until
/// `createPack` finally runs. Nothing here blocks leaving early: a swipe
/// back (or the system back button) just leaves the draft exactly as it
/// was, still flagged on the purchase screen.
///
/// `resolver` is the one `BarcodeResolutionModel.commitPendingCase()`
/// detached — it already knows the scanned code and the outside guess, if
/// one landed. Everything here is the same "create a case" page the
/// resolution sheet used to hold inline, just promoted to its own screen so
/// a half-filled case is never lost between scans.
struct CaseContentsView: View {
    let resolver: BarcodeResolutionModel

    @Environment(\.modelContext) private var context
    @Environment(\.dismiss) private var dismiss

    @State private var packName = ""
    @State private var packNameTouched = false
    @State private var contentQuery = ""
    @State private var isSearchingContents = false
    @State private var isWorking = false

    var body: some View {
        Form {
            errorSection
            codeSection

            Section {
                TextField(
                    "e.g. Frito-Lay 30ct variety",
                    text: Binding(get: { shownPackName }, set: { packName = $0; packNameTouched = true })
                )
            } header: {
                Text("Case name")
            }

            Section {
                ForEach(resolver.contents) { content in
                    contentRow(content)
                }
                addContentDoors
            } header: {
                Text("What's inside one case, in sellable units")
            } footer: {
                Text("Scan the bags inside, or pick products you already have.")
            }

            if isSearchingContents {
                contentSearchSection
            }

            Section {
                Button(action: submit) {
                    if isWorking {
                        ProgressView()
                    } else {
                        Text("Done")
                    }
                }
                .disabled(isWorking)
            }
        }
        .navigationTitle("Case contents")
        .navigationBarTitleDisplayMode(.inline)
        .navigationDestination(isPresented: contentFlowBinding) {
            if let inner = resolver.contentResolver {
                BarcodeResolutionFlow(model: inner, startsBlank: resolver.contentDoor == .blankCreate)
            }
        }
    }

    private var contentFlowBinding: Binding<Bool> {
        Binding(
            get: { resolver.contentResolver != nil },
            set: { isPresented in
                if !isPresented { resolver.endContentResolution() }
            }
        )
    }

    @ViewBuilder
    private var codeSection: some View {
        if let scan = resolver.pendingScan {
            Section {
                Text(scan.gtin14)
                    .font(.system(.body, design: .monospaced))
                    .foregroundStyle(.secondary)
            }
        }
    }

    @ViewBuilder
    private var errorSection: some View {
        if let message = resolver.errorMessage {
            Section {
                Text(message)
                    .foregroundStyle(.red)
            }
        }
    }

    /// A resolved row: the product is settled, so only its unit count is
    /// still a question.
    private func contentRow(_ content: BarcodeResolutionModel.PackContentDraft) -> some View {
        HStack {
            Text(content.name)
                .lineLimit(2)
            Spacer()
            TextField(
                "Units",
                text: Binding(
                    get: { content.unitsText },
                    set: { resolver.updateContent(id: content.id, unitsText: $0) }
                )
            )
            .keyboardType(.numberPad)
            .multilineTextAlignment(.trailing)
            .frame(width: 70)

            Button(role: .destructive) {
                resolver.removeContent(id: content.id)
            } label: {
                Image(systemName: "xmark.circle")
            }
            .buttonStyle(.plain)
        }
    }

    /// The three ways a product gets into the case. All three end with a
    /// real product, which is why a row can never be blank.
    private var addContentDoors: some View {
        HStack(spacing: 16) {
            if BarcodeScannerView.isSupported {
                Button {
                    resolver.beginContentResolution(through: .scanner)
                } label: {
                    Label("Scan", systemImage: "barcode.viewfinder")
                }
            }
            Button {
                isSearchingContents.toggle()
                contentQuery = ""
            } label: {
                Label("Search", systemImage: "magnifyingglass")
            }
            Button {
                resolver.beginContentResolution(through: .blankCreate)
            } label: {
                Label("New", systemImage: "plus.circle")
            }
        }
        .buttonStyle(.borderless)
        .font(.subheadline)
    }

    /// Picking a product already in the catalog needs no network and no
    /// resolver — it is just a name search over the mirror, products only.
    private var contentSearchSection: some View {
        Section {
            TextField("Search your products…", text: $contentQuery)
                .autocorrectionDisabled()
            if !contentQuery.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                CatalogItemMatches(
                    items: resolver.contentSearchResults(query: contentQuery, context: context),
                    isDisabled: false,
                    emptyText: "Nothing matches — scan it, or tap \"New\".",
                    onSelect: { item in
                        resolver.addContent(item)
                        isSearchingContents = false
                        contentQuery = ""
                    }
                )
            }
        } header: {
            Text("Add a product you already have")
        }
    }

    /// Single-content case names itself precisely from its own product and
    /// unit count; a variety pack falls back to the outside guess. Only a
    /// suggestion — `shownPackName` stops showing it once the field is
    /// edited.
    private var suggestedPackName: String {
        if resolver.contents.count == 1 {
            let only = resolver.contents[0]
            let units = only.unitsText.trimmingCharacters(in: .whitespaces)
            if !only.name.isEmpty, !units.isEmpty {
                return "\(only.name) — case (\(units))"
            }
        }
        return resolver.pendingScan?.candidate?.displayName ?? ""
    }

    private var shownPackName: String {
        packNameTouched ? packName : suggestedPackName
    }

    /// Success pops back to the purchase row, which `PurchaseLogModel`
    /// has already turned into a real `.pack` by the time `createPack`'s
    /// `onResolve` fires — a failure leaves this screen up to retry.
    private func submit() {
        isWorking = true
        Task {
            await resolver.createPack(name: shownPackName, context: context)
            isWorking = false
            if resolver.errorMessage == nil { dismiss() }
        }
    }
}
