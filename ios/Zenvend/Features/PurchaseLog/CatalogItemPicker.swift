import SwiftUI

/// The scanned code, shown above whatever question is being asked about it.
struct ScannedCodeSection: View {
    let model: BarcodeResolutionModel

    var body: some View {
        if let scan = model.pendingScan {
            Section {
                Text(scan.gtin14)
                    .font(.system(.body, design: .monospaced))
                    .foregroundStyle(.secondaryText)
            }
        }
    }
}

/// Whatever the resolver last refused. `onUseExisting` is the 409 recovery —
/// the code already belongs to another record, and attaching to THAT record is
/// the way out — so only the screens that can offer it pass one.
struct ResolverErrorSection: View {
    let model: BarcodeResolutionModel
    var onUseExisting: (() -> Void)?

    var body: some View {
        if let message = model.errorMessage {
            Section {
                Text(message)
                    .foregroundStyle(.error)
                if let onUseExisting, model.errorStatusCode == 409 {
                    Button("Use existing instead", action: onUseExisting)
                }
            }
        }
    }
}

/// A text binding that remembers it was edited, so a late-arriving suggestion
/// never overwrites what the operator typed.
extension Binding where Value == String {
    func touching(_ touched: Binding<Bool>) -> Binding<String> {
        Binding(
            get: { wrappedValue },
            set: { wrappedValue = $0; touched.wrappedValue = true }
        )
    }
}

/// A name-filtered list of `CatalogItem` results — the attach picker and the
/// "Add without scanning" picker render the same row, so the two can't drift.
///
/// Rendering only: the search itself is `model.searchResults`, run by the
/// caller so each picker can own its own query text and empty-state wording.
struct CatalogItemMatches: View {
    let items: [CatalogItem]
    let isDisabled: Bool
    let emptyText: String
    let onSelect: (CatalogItem) -> Void

    var body: some View {
        if items.isEmpty {
            Text(emptyText)
                .foregroundStyle(.secondaryText)
        } else {
            ForEach(items) { item in
                Button {
                    onSelect(item)
                } label: {
                    row(item)
                }
                .disabled(isDisabled)
            }
        }
    }

    private func row(_ item: CatalogItem) -> some View {
        HStack(spacing: 10) {
            KindBadge(isPack: item.isPack)
            VStack(alignment: .leading, spacing: 1) {
                Text(item.name)
                    .foregroundStyle(.primary)
                Text(detail(item))
                    .font(.caption)
                    .foregroundStyle(.secondaryText)
            }
            Spacer()
        }
    }

    private func detail(_ item: CatalogItem) -> String {
        let code = item.barcode ?? "no barcode yet"
        guard case .pack(let units) = item.kind else { return code }
        return "\(code) · \(units) units"
    }
}

/// A search field over the catalog with its matches under it, and any extra
/// sections the caller adds below.
struct CatalogSearchForm<Extra: View>: View {
    let prompt: String
    let emptyText: String
    let results: (String) -> [CatalogItem]
    let onSelect: (CatalogItem) -> Void
    @ViewBuilder var extra: () -> Extra

    @State private var query = ""

    var body: some View {
        Form {
            Section {
                TextField(prompt, text: $query)
                    .autocorrectionDisabled()
                if !query.trimmed.isEmpty {
                    CatalogItemMatches(
                        items: results(query),
                        isDisabled: false,
                        emptyText: emptyText,
                        onSelect: onSelect
                    )
                }
            }
            extra()
        }
        .lagoonBackground()
    }
}

extension CatalogSearchForm where Extra == EmptyView {
    init(
        prompt: String,
        emptyText: String,
        results: @escaping (String) -> [CatalogItem],
        onSelect: @escaping (CatalogItem) -> Void
    ) {
        self.init(prompt: prompt, emptyText: emptyText, results: results, onSelect: onSelect) {
            EmptyView()
        }
    }
}
