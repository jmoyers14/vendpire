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

    // Create — item
    @State private var recordKind: RecordKind = .unit
    @State private var name = ""
    @State private var category = ""
    @State private var priceText = ""

    // Create — pack
    @State private var packName = ""
    @State private var nameTouched = false
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

    /// No status code survives to this layer — `attach`/`createUnit`/`createPack`
    /// all collapse their failure to `error.localizedDescription` — so a
    /// conflict can only be recognized by its wording. Source of that wording:
    /// `packages/api/src/services/ProductService/ProductServiceImpl.ts`
    /// ("already on \"<name>\"" / "is the case code of pack"),
    /// `packages/api/src/services/PackService/PackServiceImpl.ts`
    /// ("already on pack" / "unit code of"), and the generic 409 "The barcode
    /// already belongs to another record" in `routers/products.ts` and
    /// `routers/packs.ts`. A server-side rewording of any of these breaks this
    /// match.
    private var isConflict: Bool {
        guard let message = model.errorMessage else { return false }
        return message.localizedCaseInsensitiveContains("already on")
            || message.localizedCaseInsensitiveContains("already belongs")
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
        Section {
            TextField("Search your products and cases…", text: $query)
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
    }

    @ViewBuilder
    private var attachMatches: some View {
        let trimmedQuery = query.trimmingCharacters(in: .whitespacesAndNewlines)
        if !trimmedQuery.isEmpty {
            let matches = model.searchResults(query: query, context: context)
            if matches.isEmpty {
                Text("Nothing matches — create it below instead.")
                    .foregroundStyle(.secondary)
            } else {
                ForEach(matches) { item in
                    Button {
                        attach(item)
                    } label: {
                        attachRow(item)
                    }
                    .disabled(isWorking)
                }
            }
        }
    }

    private func attachRow(_ item: CatalogItem) -> some View {
        HStack(spacing: 10) {
            Text(item.isPack ? "CASE" : "ITEM")
                .font(.caption2)
                .fontWeight(.bold)
                .padding(.horizontal, 6)
                .padding(.vertical, 2)
                .background(
                    item.isPack ? Color.accentColor.opacity(0.15) : Color.secondary.opacity(0.15),
                    in: Capsule()
                )
            VStack(alignment: .leading, spacing: 1) {
                Text(item.name)
                    .foregroundStyle(.primary)
                Text(attachDetail(item))
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
            Spacer()
        }
    }

    private func attachDetail(_ item: CatalogItem) -> String {
        let code = item.barcode ?? "no barcode yet"
        guard case .pack(let units) = item.kind else { return code }
        return "\(code) · \(units) units"
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
            }
        }
    }

    private var itemFields: some View {
        Section {
            TextField("Name, e.g. Coca-Cola Zero 12 oz can", text: $name)
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
                    text: Binding(get: { shownPackName }, set: { packName = $0; nameTouched = true })
                )
            } header: {
                Text("Case name")
            }

            Section {
                ForEach(contents.indices, id: \.self) { index in
                    contentRow(index: index)
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

    private func contentRow(index: Int) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack {
                Picker("Product", selection: $contents[index].productId) {
                    Text("New product…").tag(String?.none)
                    ForEach(products) { product in
                        Text(product.name).tag(String?.some(product.id))
                    }
                }
                .labelsHidden()

                TextField("Units", text: $contents[index].unitsText)
                    .keyboardType(.numberPad)
                    .frame(width: 70)

                if contents.count > 1 {
                    Button(role: .destructive) {
                        contents.remove(at: index)
                    } label: {
                        Image(systemName: "xmark.circle")
                    }
                    .buttonStyle(.plain)
                }
            }

            if contents[index].productId == nil {
                TextField("Name, e.g. Doritos Nacho Cheese", text: $contents[index].name)
                TextField("Category", text: $contents[index].category)
                TextField("Bag barcode (optional)", text: $contents[index].bagCode)
                    .font(.system(.body, design: .monospaced))
                    .autocorrectionDisabled()
                bagCodeHint(for: contents[index].bagCode)
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
        nameTouched ? packName : suggestedPackName
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

    /// The candidate's name seeds both the attach search and the create
    /// form — whichever the operator picks, it is the first guess worth
    /// typing over rather than starting blank.
    ///
    /// Deliberately one-shot (`onAppear`, not an observer on `pendingScan`):
    /// web parity. `BarcodeNotFoundPanel`'s `useState` initializers read the
    /// candidate prop exactly once too, so a candidate that resolves after
    /// the panel/sheet is already open never overwrites something the
    /// operator may have started typing.
    private func seed() {
        guard let scan = model.pendingScan else { return }
        recordKind = scan.likelyCase ? .pack : .unit

        let suggestion = scan.candidate.map(candidateName) ?? ""
        query = suggestion
        name = suggestion
        if contents.indices.contains(0) {
            contents[0].name = suggestion
        }
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
