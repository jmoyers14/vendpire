import SwiftData
import SwiftUI

/// What to do with a scanned code nobody recognises: phone-shaped port of the
/// web's `BarcodeNotFoundPanel`. Attach and create are explicit peers — the
/// choose screen never defaults into either, because the right answer isn't
/// guessable from the code. CSV-imported products arrive with no barcode, so
/// the thing just scanned is often already here under a name worth checking
/// for first.
///
/// Every rule — validation, the conflict text, the actual network calls —
/// lives in `PurchaseLogModel`. This view is layout and bindings only.
struct BarcodeNotFoundSheet: View {
    @Bindable var model: PurchaseLogModel

    @Environment(\.modelContext) private var context

    /// Existing products, for the pack-contents picker. A plain mirror read,
    /// not a model rule — `model.searchResults` is for the attach list, which
    /// is name-filtered and mixes in packs; this is the raw product list a
    /// `Picker` needs.
    @Query(filter: #Predicate<StoredProduct> { $0.active }, sort: \StoredProduct.name)
    private var products: [StoredProduct]

    private enum Mode {
        case choose, attach, create
    }

    private enum RecordKind {
        case unit, pack
    }

    @State private var mode: Mode = .choose
    @State private var isWorking = false

    // Attach
    @State private var query = ""
    @State private var queryTouched = false

    // Create — item
    @State private var recordKind: RecordKind = .unit
    @State private var name = ""
    @State private var itemNameTouched = false
    @State private var category = ""
    @State private var priceText = ""

    // Create — pack
    @State private var packName = ""
    @State private var packNameTouched = false
    @State private var contentNameTouched = false
    @State private var contents: [PurchaseLogModel.NewPackContent] = [
        PurchaseLogModel.NewPackContent(productId: nil, unitsText: "", name: "", category: "", bagCode: "")
    ]

    var body: some View {
        NavigationStack {
            Form {
                errorSection
                headerSection

                switch mode {
                case .choose: chooseSection
                case .attach: attachSection
                case .create: createSection
                }
            }
            .navigationTitle("Barcode not found")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { model.dismissPendingScan() }
                }
            }
        }
        .presentationDetents([.large])
        .onAppear(perform: seed)
        // The candidate lookup STARTS in the same pass that presents this
        // sheet, so it always lands after `onAppear`. Without this the prefill
        // never happened.
        .onChange(of: model.pendingScan?.candidate) { _, _ in fillUntouchedFields() }
    }

    // MARK: - Header

    private var headerSection: some View {
        Section {
            Text(model.pendingScan?.gtin14 ?? "")
                .font(.system(.body, design: .monospaced))
                .foregroundStyle(.secondary)

            if let candidate = model.pendingScan?.candidate, candidate.name != nil {
                maybeCard(candidate)
            }
        }
    }

    private func maybeCard(_ candidate: RemoteCandidate) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            HStack(spacing: 10) {
                AsyncImage(url: candidate.imageUrl.flatMap(URL.init)) { image in
                    image.resizable().aspectRatio(contentMode: .fit)
                } placeholder: {
                    Color.clear
                }
                .frame(width: 40, height: 40)

                VStack(alignment: .leading, spacing: 2) {
                    Text("Maybe")
                        .font(.caption)
                        .fontWeight(.bold)
                    Text(candidateName(candidate))
                        .font(.subheadline)
                        .lineLimit(2)
                }
                Spacer()
            }
            Text("From Open Food Facts — not your catalog.")
                .font(.footnote)
                .foregroundStyle(.secondary)
        }
    }

    /// Brand-first, unless the name already says the brand — ported from the
    /// web panel's `candidateName`.
    private func candidateName(_ candidate: RemoteCandidate) -> String {
        guard let name = candidate.name else { return "" }
        guard let brand = candidate.brand, !name.localizedCaseInsensitiveContains(brand) else {
            return name
        }
        return "\(brand) \(name)"
    }

    // MARK: - Error / conflict

    /// The status is what actually decides this: every catalog failure now
    /// arrives as a `VendpireAPIError` and the model keeps its code.
    ///
    /// The wording match stays as a fallback for a conflict that reaches the
    /// screen without one — a message surfaced from somewhere other than the
    /// typed client seam. Source of the wording:
    /// `packages/api/src/services/ProductService/ProductServiceImpl.ts`
    /// (`is already on "<name>"`, `is the case code of pack "<name>"`),
    /// `packages/api/src/services/PackService/PackServiceImpl.ts`
    /// (`is already on pack "<name>"`, `is the unit code of "<name>"`), and
    /// the generic 409 "The barcode already belongs to another record" in
    /// `routers/products.ts` and `routers/packs.ts`.
    private var isConflict: Bool {
        if model.errorStatusCode == 409 { return true }

        guard let message = model.errorMessage else { return false }
        return message.localizedCaseInsensitiveContains("already on")
            || message.localizedCaseInsensitiveContains("already belongs")
            || message.localizedCaseInsensitiveContains("is the unit code of")
            || message.localizedCaseInsensitiveContains("is the case code of")
    }

    @ViewBuilder
    private var errorSection: some View {
        if let message = model.errorMessage {
            Section {
                Text(message)
                    .foregroundStyle(.red)
                // The server names the record the code is already on; the
                // fastest way out is picking it from the attach list rather
                // than retyping the search.
                if isConflict {
                    Button("Use existing instead") { mode = .attach }
                }
            }
        }
    }

    // MARK: - Choose

    private var chooseSection: some View {
        Section {
            Button("It's already in my catalog") { mode = .attach }
            Button("Create it") { mode = .create }
        } footer: {
            Text("Your imported products arrived without barcodes — check before creating a duplicate.")
        }
    }

    // MARK: - Attach

    private var attachSection: some View {
        Group {
            Section {
                TextField(
                    "Search your products and cases…",
                    text: makeTouchedBinding(for: $query, touched: $queryTouched)
                )
                .autocorrectionDisabled()
                attachMatches
            } header: {
                Text("Add this code to something you already have")
            } footer: {
                if isWorking {
                    HStack(spacing: 6) {
                        ProgressView()
                        Text("Attaching…")
                    }
                }
            }

            // Searching and finding nothing is the common way into creating,
            // so the way across is always on screen — not only when the list
            // comes back empty. `Back` mirrors the web panel's.
            Section {
                Button("Create it instead") { mode = .create }
                Button("Back") { mode = .choose }
            }
        }
    }

    @ViewBuilder
    private var attachMatches: some View {
        let trimmedQuery = query.trimmingCharacters(in: .whitespacesAndNewlines)
        if !trimmedQuery.isEmpty {
            CatalogItemMatches(
                items: model.searchResults(query: query, context: context),
                isDisabled: isWorking,
                emptyText: "Nothing matches — tap \"Create it instead\" below.",
                onSelect: attach
            )
        }
    }

    private func attach(_ item: CatalogItem) {
        isWorking = true
        Task {
            await model.attach(to: item, context: context)
            isWorking = false
        }
    }

    // MARK: - Create

    private var createSection: some View {
        Group {
            Section {
                Picker("What is it?", selection: $recordKind) {
                    Text("Item").tag(RecordKind.unit)
                    Text("Case").tag(RecordKind.pack)
                }
                .pickerStyle(.segmented)
            }

            if recordKind == .unit {
                itemFields
            } else {
                packFields
            }

            Section {
                Button(action: create) {
                    if isWorking {
                        ProgressView()
                    } else {
                        Text("Add to purchase")
                    }
                }
                .disabled(isWorking)
                Button("Back") { mode = .choose }
                    .disabled(isWorking)
            }
        }
    }

    private var itemFields: some View {
        Section {
            TextField(
                "Name, e.g. Coca-Cola Zero 12 oz can",
                text: makeTouchedBinding(for: $name, touched: $itemNameTouched)
            )
            TextField("Category, e.g. drinks", text: $category)
            TextField("Sell price $", text: $priceText)
                .keyboardType(.decimalPad)
        } footer: {
            Text("Optional — set it on the planogram later.")
        }
    }

    private var packFields: some View {
        Group {
            Section {
                TextField(
                    "e.g. Frito-Lay 30ct variety",
                    text: Binding(
                        get: { shownPackName },
                        set: { packName = $0; packNameTouched = true }
                    )
                )
            } header: {
                Text("Case name")
            }

            Section {
                ForEach($contents) { content in
                    contentRow(content, isFirst: contents.first?.id == content.wrappedValue.id)
                }
                Button("+ Add another product") {
                    contents.append(
                        PurchaseLogModel.NewPackContent(
                            productId: nil, unitsText: "", name: "", category: "", bagCode: ""
                        )
                    )
                }
            } header: {
                Text("What's inside one case, in sellable units")
            }
        }
    }

    /// Bound per element and deleted by id — an index-identified row hands its
    /// binding to whichever row slides into that index when one is removed.
    ///
    /// Only the first row's name is seeded from the candidate, so only it
    /// tracks being typed in.
    private func contentRow(
        _ content: Binding<PurchaseLogModel.NewPackContent>,
        isFirst: Bool
    ) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack {
                Picker("Product", selection: content.productId) {
                    Text("New product…").tag(String?.none)
                    ForEach(products) { product in
                        Text(product.name).tag(String?.some(product.id))
                    }
                }
                .labelsHidden()

                TextField("Units", text: content.unitsText)
                    .keyboardType(.numberPad)
                    .frame(width: 70)

                if contents.count > 1 {
                    Button(role: .destructive) {
                        let id = content.wrappedValue.id
                        contents.removeAll { $0.id == id }
                    } label: {
                        Image(systemName: "xmark.circle")
                    }
                    .buttonStyle(.plain)
                }
            }

            if content.wrappedValue.productId == nil {
                TextField(
                    "Name, e.g. Doritos Nacho Cheese",
                    text: isFirst
                        ? makeTouchedBinding(for: content.name, touched: $contentNameTouched)
                        : content.name
                )
                TextField("Category", text: content.category)
                TextField("Bag barcode (optional)", text: content.bagCode)
                    .font(.system(.body, design: .monospaced))
                    .autocorrectionDisabled()
                bagCodeHint(for: content.wrappedValue.bagCode)
            }
        }
    }

    /// The single bag's own code — never the case code just scanned. Checked
    /// inline so a typo is caught before `createPack` rejects the whole row.
    @ViewBuilder
    private func bagCodeHint(for bagCode: String) -> some View {
        let trimmed = bagCode.trimmingCharacters(in: .whitespaces)
        if !trimmed.isEmpty, Gtin.normalize(trimmed) == nil {
            Text("Doesn't look like a valid barcode")
                .font(.caption)
                .foregroundStyle(.red)
        }
    }

    /// Single-content case names itself precisely from its own product and
    /// unit count; a variety pack falls back to the outside guess. Only a
    /// suggestion — `shownPackName` stops showing it once the field is edited.
    private var suggestedPackName: String {
        if contents.count == 1 {
            let only = contents[0]
            let label = contentProductName(only)
            let units = only.unitsText.trimmingCharacters(in: .whitespaces)
            if !label.isEmpty, !units.isEmpty {
                return "\(label) — case (\(units))"
            }
        }
        guard let candidate = model.pendingScan?.candidate else { return "" }
        return candidateName(candidate)
    }

    private var shownPackName: String {
        packNameTouched ? packName : suggestedPackName
    }

    private func contentProductName(_ content: PurchaseLogModel.NewPackContent) -> String {
        if let productId = content.productId {
            return products.first { $0.id == productId }?.name ?? ""
        }
        return content.name.trimmingCharacters(in: .whitespaces)
    }

    private func create() {
        isWorking = true
        Task {
            if recordKind == .unit {
                await model.createUnit(name: name, category: category, priceText: priceText, context: context)
            } else {
                await model.createPack(name: shownPackName, contents: contents, context: context)
            }
            isWorking = false
        }
    }

    // MARK: - Seeding

    /// What the code itself says: a case-level indicator digit opens the
    /// create form on "a case". Known before the sheet is on screen, and the
    /// operator's own pick must survive a late candidate — so this runs once,
    /// and the candidate fill below runs again.
    private func seed() {
        guard let scan = model.pendingScan else { return }
        recordKind = scan.likelyCase ? .pack : .unit
        fillUntouchedFields()
    }

    /// The candidate's name seeds the attach search, the item name, and the
    /// first content row — whichever the operator picks, it is the first guess
    /// worth typing over rather than starting blank.
    ///
    /// Runs again every time the candidate changes, because the lookup starts
    /// in the same pass that presents the sheet and so always answers after
    /// it is already on screen. A field the operator has typed in is never
    /// overwritten — that is what the `*Touched` flags are for, and it is the
    /// rule the web panel gets for free by reading the prop once.
    private func fillUntouchedFields() {
        guard let candidate = model.pendingScan?.candidate else { return }
        let suggestion = candidateName(candidate)

        if !queryTouched { query = suggestion }
        if !itemNameTouched { name = suggestion }
        if !contentNameTouched, contents.indices.contains(0) {
            contents[0].name = suggestion
        }
    }

    /// A text binding that remembers it was edited.
    private func makeTouchedBinding(
        for value: Binding<String>,
        touched: Binding<Bool>
    ) -> Binding<String> {
        Binding(
            get: { value.wrappedValue },
            set: { value.wrappedValue = $0; touched.wrappedValue = true }
        )
    }
}

#Preview {
    let container = try! VendpireStore.makeInMemoryContainer()
    let context = ModelContext(container)
    let model = PurchaseLogModel()
    // A valid, unrecognized UPC-A: no api configured, so the candidate lookup
    // is a no-op and the sheet opens straight to "choose".
    model.handleScan("012345678905", context: context)

    return BarcodeNotFoundSheet(model: model)
        .modelContainer(container)
}
