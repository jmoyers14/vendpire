import SwiftData
import SwiftUI

/// Camera until a code needs a human, then the question. Both levels of the
/// flow present this, which is why the switch lives here rather than in the
/// purchase screen that used to own it.
struct BarcodeResolutionFlow: View {
    let model: BarcodeResolutionModel
    /// Skip the camera and open straight on the create form — the inner
    /// editor's "this bag has no barcode at all" door.
    var startsBlank = false

    @Environment(\.modelContext) private var context

    var body: some View {
        if startsBlank {
            BarcodeResolutionSheet(model: model, initialMode: .create)
        } else if model.pendingScan != nil {
            BarcodeResolutionSheet(model: model)
        } else {
            BarcodeScannerView(onScan: { code in model.resolve(code, context: context) })
                .overlay(alignment: .bottom) { scanError }
        }
    }

    /// A refused scan has to be visible without leaving the camera — the
    /// operator's hands are full and the next item is already coming up.
    @ViewBuilder
    private var scanError: some View {
        if let message = model.errorMessage {
            Text(message)
                .font(.footnote)
                .multilineTextAlignment(.center)
                .padding(10)
                .background(.red.opacity(0.9), in: RoundedRectangle(cornerRadius: 8))
                .foregroundStyle(.white)
                .padding()
        }
    }
}

/// What to do with a scanned code nobody recognises: phone-shaped port of the
/// web's `BarcodeNotFoundPanel`. Attach and create are explicit peers — the
/// choose step never defaults into either, because the right answer isn't
/// guessable from the code. CSV-imported products arrive with no barcode, so
/// the thing just scanned is often already here under a name worth checking
/// for first.
///
/// Every rule — validation, the conflict text, the actual network calls —
/// lives in `BarcodeResolutionModel`. This view is layout and bindings only.
struct BarcodeResolutionSheet: View {
    enum Mode {
        case choose, attach, create
    }

    let model: BarcodeResolutionModel

    @Environment(\.modelContext) private var context

    private enum RecordKind {
        case unit, pack
    }

    @State private var mode: Mode
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

    // Create — case
    @State private var packName = ""
    @State private var packNameTouched = false
    @State private var contentQuery = ""
    @State private var isSearchingContents = false

    init(model: BarcodeResolutionModel, initialMode: Mode = .choose) {
        self.model = model
        _mode = State(initialValue: initialMode)
    }

    var body: some View {
        Form {
            errorSection
            headerSection

            switch mode {
            case .choose: chooseSection
            case .attach: attachSection
            case .create: createSection
            }
        }
        .navigationTitle(model.pendingScan == nil ? "New product" : "Barcode not found")
        .navigationBarTitleDisplayMode(.inline)
        .onAppear(perform: seed)
        // The candidate lookup STARTS in the same pass that presents this
        // sheet, so it always lands after `onAppear`. Without this the prefill
        // never happened.
        .onChange(of: model.pendingScan?.candidate) { _, _ in fillUntouchedFields() }
        // One product of the case, resolved by the same tree one level down.
        // Pushed rather than presented: this form's state has to survive the
        // round trip, and a sheet over a Form in a sheet fights detents.
        .navigationDestination(isPresented: contentFlowBinding) {
            if let inner = model.contentResolver {
                BarcodeResolutionFlow(model: inner, startsBlank: model.contentDoor == .blankCreate)
            }
        }
    }

    private var contentFlowBinding: Binding<Bool> {
        Binding(
            get: { model.contentResolver != nil },
            set: { isPresented in
                if !isPresented { model.endContentResolution() }
            }
        )
    }

    // MARK: - Header

    @ViewBuilder
    private var headerSection: some View {
        if let scan = model.pendingScan {
            Section {
                Text(scan.gtin14)
                    .font(.system(.body, design: .monospaced))
                    .foregroundStyle(.secondary)

                if let candidate = scan.candidate, candidate.name != nil {
                    maybeCard(candidate)
                }
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

    /// Every catalog failure arrives as a `VendpireAPIError` and the model
    /// keeps its status code, so no prose matching is needed: 409 means
    /// another record already owns the code.
    private var isConflict: Bool {
        model.errorStatusCode == 409
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
            Button(model.allowsPacks ? "It's already in my catalog" : "It's already a product I have") {
                mode = .attach
            }
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
                    model.allowsPacks
                        ? "Search your products and cases…"
                        : "Search your products…",
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
            // Only a resolver that may answer with a pack can offer to create
            // one. One level down this control is absent, which is what stops
            // a case from containing a case.
            if model.allowsPacks {
                Section {
                    Picker("What is it?", selection: $recordKind) {
                        Text("Item").tag(RecordKind.unit)
                        Text("Case").tag(RecordKind.pack)
                    }
                    .pickerStyle(.segmented)
                }
            }

            if recordKind == .unit || !model.allowsPacks {
                itemFields
            } else {
                packFields
            }

            Section {
                Button(action: create) {
                    if isWorking {
                        ProgressView()
                    } else {
                        Text(model.allowsPacks ? "Add to purchase" : "Add to the case")
                    }
                }
                .disabled(isWorking)
                if model.pendingScan != nil {
                    Button("Back") { mode = .choose }
                        .disabled(isWorking)
                }
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

    // MARK: - Create a case

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
                ForEach(model.contents) { content in
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
        }
    }

    /// A resolved row: the product is settled, so only its unit count is still
    /// a question.
    private func contentRow(
        _ content: BarcodeResolutionModel.PackContentDraft
    ) -> some View {
        HStack {
            Text(content.name)
                .lineLimit(2)
            Spacer()
            TextField(
                "Units",
                text: Binding(
                    get: { content.unitsText },
                    set: { model.updateContent(id: content.id, unitsText: $0) }
                )
            )
            .keyboardType(.numberPad)
            .multilineTextAlignment(.trailing)
            .frame(width: 70)

            Button(role: .destructive) {
                model.removeContent(id: content.id)
            } label: {
                Image(systemName: "xmark.circle")
            }
            .buttonStyle(.plain)
        }
    }

    /// The three ways a product gets into the case. All three end with a real
    /// product, which is why a row can never be blank.
    private var addContentDoors: some View {
        HStack(spacing: 16) {
            if BarcodeScannerView.isSupported {
                Button {
                    model.beginContentResolution(through: .scanner)
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
                model.beginContentResolution(through: .blankCreate)
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
                    items: model.contentSearchResults(query: contentQuery, context: context),
                    isDisabled: false,
                    emptyText: "Nothing matches — scan it, or tap \"New\".",
                    onSelect: { item in
                        model.addContent(item)
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
    /// suggestion — `shownPackName` stops showing it once the field is edited.
    private var suggestedPackName: String {
        if model.contents.count == 1 {
            let only = model.contents[0]
            let units = only.unitsText.trimmingCharacters(in: .whitespaces)
            if !only.name.isEmpty, !units.isEmpty {
                return "\(only.name) — case (\(units))"
            }
        }
        guard let candidate = model.pendingScan?.candidate else { return "" }
        return candidateName(candidate)
    }

    private var shownPackName: String {
        packNameTouched ? packName : suggestedPackName
    }

    private func create() {
        isWorking = true
        Task {
            if recordKind == .unit || !model.allowsPacks {
                await model.createUnit(
                    name: name, category: category, priceText: priceText, context: context
                )
            } else {
                await model.createPack(name: shownPackName, context: context)
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
        recordKind = scan.likelyCase && model.allowsPacks ? .pack : .unit
        fillUntouchedFields()
    }

    /// The candidate's name seeds the attach search and the item name —
    /// whichever the operator picks, it is the first guess worth typing over
    /// rather than starting blank.
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
