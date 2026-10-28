import SwiftUI

/// The "ITEM" / "CASE" pill shown anywhere a `CatalogItem` or `PurchaseRow`
/// needs to say which kind of record it is.
struct KindBadge: View {
    let isPack: Bool

    var body: some View {
        Text(isPack ? "CASE" : "ITEM")
            .font(.caption2)
            .fontWeight(.bold)
            .padding(.horizontal, 6)
            .padding(.vertical, 2)
            .background(
                isPack ? Color.accentColor.opacity(0.15) : Color.secondary.opacity(0.15),
                in: Capsule()
            )
    }
}

/// A name-filtered list of `CatalogItem` results — Task 16's attach picker and
/// this screen's "Add without scanning" picker both render the same row, so
/// the two can't drift apart.
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
                .foregroundStyle(.secondary)
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
                    .foregroundStyle(.secondary)
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
