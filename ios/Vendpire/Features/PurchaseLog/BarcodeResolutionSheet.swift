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
    /// What the last scan put on the purchase. Nil one level down, where the
    /// contents list is already on screen doing the same job.
    var confirmation: ScanConfirmation?
    /// Lines so far — cumulative proof the scanner is working, which a card
    /// showing only the most recent scan can't give on its own.
    var itemCount: Int?
    var onUndo: (() -> Void)?

    @Environment(\.modelContext) private var context

    var body: some View {
        // Grouped so the feedback below survives the swap from camera to
        // question, which happens in the same pass as the read it reports.
        Group {
            if startsBlank {
                BarcodeResolutionSheet(model: model, initialMode: .create)
            } else if model.pendingScan != nil {
                BarcodeResolutionSheet(model: model)
            } else {
                BarcodeScannerView(onScan: { code in model.resolve(code, context: context) })
                    .overlay(alignment: .top) { itemCountBadge }
                    .overlay(alignment: .bottom) { scanFeedback }
                    // Pinned: this branch sets no title, and `.automatic`
                    // leaves a blank large-title band over the camera.
                    .navigationBarTitleDisplayMode(.inline)
            }
        }
        // Eyes are on the cart as often as the screen, so the fastest "got it"
        // is one you feel. On the read, not the outcome: an unknown code has
        // nothing else to buzz about.
        .sensoryFeedback(trigger: model.lastReadId) { _, _ in
            model.errorMessage == nil ? .success : .error
        }
    }

    /// A refusal outranks a confirmation: it is the one that needs acting on,
    /// and the scan it refused put nothing on the purchase to report.
    @ViewBuilder
    private var scanFeedback: some View {
        if let message = model.errorMessage {
            Text(message)
                .font(.footnote)
                .multilineTextAlignment(.center)
                .padding(10)
                .background(LagoonPalette.red600.opacity(0.9), in: RoundedRectangle(cornerRadius: 8))
                .foregroundStyle(.white)
                .padding()
        } else if let confirmation {
            confirmationCard(confirmation)
        }
    }

    /// Stays up until the next scan replaces it. Undo is here rather than a
    /// confirm step before the add, because confirming costs a tap on every
    /// one of thirty items and undoing costs one on the rare mistake.
    private func confirmationCard(_ confirmation: ScanConfirmation) -> some View {
        HStack(spacing: 12) {
            VStack(alignment: .leading, spacing: 4) {
                HStack(spacing: 8) {
                    KindBadge(isPack: confirmation.isPack)
                    Text(confirmation.name)
                        .font(.subheadline)
                        .lineLimit(1)
                }
                Text(detail(confirmation))
                    .font(.caption)
                    .foregroundStyle(.secondaryText)
            }

            Spacer(minLength: 0)

            if let onUndo {
                Button("Undo", action: onUndo)
                    .font(.subheadline.weight(.semibold))
                    .buttonStyle(.borderless)
            }
        }
        .padding(12)
        .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 12))
        .padding()
        .transition(.move(edge: .bottom).combined(with: .opacity))
        .animation(.snappy, value: confirmation.id)
    }

    /// The count, not just the name: a rescan bumps an existing row, and that
    /// is the mistake worth catching early. A case commits before it has any
    /// contents, so it reports what it still owes instead.
    private func detail(_ confirmation: ScanConfirmation) -> String {
        switch confirmation.effect {
        case .added, .incremented:
            return "\(confirmation.quantity) × on this purchase"
        case .caseStarted:
            return "On the purchase · still needs its contents"
        }
    }

    @ViewBuilder
    private var itemCountBadge: some View {
        if let itemCount, itemCount > 0 {
            Text(itemCount == 1 ? "1 item" : "\(itemCount) items")
                .font(.caption.weight(.semibold))
                .padding(.horizontal, 10)
                .padding(.vertical, 5)
                .background(.regularMaterial, in: Capsule())
                .padding(.top, 8)
        }
    }
}

/// What to do with a scanned code nobody recognises: a phone-shaped port of
/// the web's `BarcodeNotFoundPanel`. Attach and create are explicit peers,
/// because the right answer isn't guessable from the code — CSV-imported
/// products arrive with no barcode, so the thing just scanned is often already
/// here under a name worth checking first.
///
/// One `navigationDestination` per level: same-level destinations compete for
/// the same slot in the stack. Layout and bindings only — every rule lives in
/// `BarcodeResolutionModel`.
struct BarcodeResolutionSheet: View {
    enum Mode {
        case choose, create
    }

    let model: BarcodeResolutionModel

    @Environment(\.modelContext) private var context

    /// Where "Attach" / "Create" push to. `.createKind` only exists when
    /// `model.allowsPacks` — one level down, there is no case to fork into.
    private enum Destination: Hashable {
        case attach
        case createKind
        case createItem
    }

    @State private var destination: Destination?
    /// One level deeper than `destination`, reachable only through
    /// `.createKind` — "It's a single item" pushes `createItem` from there.
    @State private var isCreatingItemFromKind = false
    @State private var isWorking = false

    // Attach
    @State private var query = ""
    @State private var queryTouched = false

    // Create — item
    @State private var name = ""
    @State private var itemNameTouched = false
    @State private var category = ""
    @State private var priceText = ""

    init(model: BarcodeResolutionModel, initialMode: Mode = .choose) {
        self.model = model
        switch initialMode {
        case .choose:
            _destination = State(initialValue: nil)
        case .create:
            _destination = State(initialValue: model.allowsPacks ? .createKind : .createItem)
        }
    }

    var body: some View {
        Form {
            ResolverErrorSection(model: model, onUseExisting: jumpToAttach)
            ScannedCodeSection(model: model)
            if destination == nil {
                maybeCardSection
                chooseSection
            }
        }
        .lagoonBackground()
        .navigationTitle(model.pendingScan == nil ? "New product" : "Barcode not found")
        .navigationBarTitleDisplayMode(.inline)
        .onAppear(perform: fillUntouchedFields)
        .onChange(of: model.pendingScan?.candidate) { _, _ in fillUntouchedFields() }
        // Every branch off this screen in one modifier: sibling
        // `navigationDestination`s are ordered by modifier nesting, not by the
        // flow.
        .navigationDestination(item: $destination) { pushed in
            switch pushed {
            case .attach: attachDestination
            case .createKind: createKindDestination
            case .createItem: createItemDestination
            }
        }
    }

    /// The server named the record the scanned code is already on — the
    /// fastest way out is picking it from the attach list, from wherever in
    /// the tree the conflict was hit.
    private func jumpToAttach() {
        isCreatingItemFromKind = false
        destination = .attach
    }

    /// Back to the camera, from however deep the flow got. A pushed screen does
    /// not pop just because the view that pushed it went away, so this runs
    /// before handing over and the pop and the swap land in one render.
    private func collapseToRoot() {
        isCreatingItemFromKind = false
        destination = nil
    }

    private func jumpToCreate() {
        isCreatingItemFromKind = false
        destination = model.allowsPacks ? .createKind : .createItem
    }

    // MARK: - Shared sections


    @ViewBuilder
    private var maybeCardSection: some View {
        if let candidate = model.pendingScan?.candidate, candidate.name != nil {
            Section {
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
                    Text(candidate.displayName)
                        .font(.subheadline)
                        .lineLimit(2)
                }
                Spacer()
            }
            Text("From Open Food Facts — not your catalog.")
                .font(.footnote)
                .foregroundStyle(.secondaryText)
        }
    }


    // MARK: - Choose (root)

    private var chooseSection: some View {
        Section {
            Button(model.allowsPacks ? "It's already in my catalog" : "It's already a product I have") {
                destination = .attach
            }
            Button("Create it") { jumpToCreate() }
        } footer: {
            Text("Your imported products arrived without barcodes — check before creating a duplicate.")
        }
    }

    // MARK: - Attach

    private var attachDestination: some View {
        Form {
            ResolverErrorSection(model: model, onUseExisting: jumpToAttach)
            ScannedCodeSection(model: model)
            Section {
                TextField(
                    model.allowsPacks
                        ? "Search your products and cases…"
                        : "Search your products…",
                    text: $query.touching($queryTouched)
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
            // so the way across is always on screen.
            Section {
                Button("Create it instead") { jumpToCreate() }
            }
        }
        .lagoonBackground()
        .navigationTitle("Search your catalog")
        .navigationBarTitleDisplayMode(.inline)
    }

    @ViewBuilder
    private var attachMatches: some View {
        let trimmedQuery = query.trimmed
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
            if model.errorMessage == nil { collapseToRoot() }
        }
    }

    // MARK: - Create: item or case?

    /// Only a resolver that may answer with a pack reaches this page — which is
    /// what stops a case from containing a case.
    private var createKindDestination: some View {
        Form {
            ResolverErrorSection(model: model, onUseExisting: jumpToAttach)
            ScannedCodeSection(model: model)
            Section {
                Button("It's a single item") { isCreatingItemFromKind = true }
                Button("It's a case of items") {
                    collapseToRoot()
                    model.commitPendingCase()
                }
            }
        }
        .lagoonBackground()
        .navigationTitle("Item, or a case?")
        .navigationBarTitleDisplayMode(.inline)
        // On the screen it pushes from, so the form lands above this question
        // rather than beside it.
        .navigationDestination(isPresented: $isCreatingItemFromKind) { createItemDestination }
    }

    // MARK: - Create: item

    private var createItemDestination: some View {
        Form {
            ResolverErrorSection(model: model, onUseExisting: jumpToAttach)
            ScannedCodeSection(model: model)
            Section {
                TextField(
                    "Name, e.g. Coca-Cola Zero 12 oz can",
                    text: $name.touching($itemNameTouched)
                )
                TextField("Category, e.g. drinks", text: $category)
                TextField("Sell price $", text: $priceText)
                    .keyboardType(.decimalPad)
            } footer: {
                Text("Optional — set it on the planogram later.")
            }

            Section {
                Button(action: submitItem) {
                    if isWorking {
                        ProgressView()
                    } else {
                        Text(model.allowsPacks ? "Add to purchase" : "Add to the case")
                    }
                }
                .disabled(isWorking)
            }
        }
        .lagoonBackground()
        .navigationTitle("New product")
        .navigationBarTitleDisplayMode(.inline)
    }

    private func submitItem() {
        isWorking = true
        Task {
            await model.createUnit(name: name, category: category, priceText: priceText, context: context)
            isWorking = false
            if model.errorMessage == nil { collapseToRoot() }
        }
    }

    // MARK: - Seeding

    /// The candidate's name seeds the attach search and the item name. Re-runs
    /// on every candidate change, since the lookup starts in the same pass that
    /// presents this sheet; the `*Touched` flags keep it off a field the
    /// operator has typed in.
    private func fillUntouchedFields() {
        guard let candidate = model.pendingScan?.candidate else { return }
        let suggestion = candidate.displayName

        if !queryTouched { query = suggestion }
        if !itemNameTouched { name = suggestion }
    }

}
