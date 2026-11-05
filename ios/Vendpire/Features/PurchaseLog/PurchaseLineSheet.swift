import SwiftData
import SwiftUI

/// One receipt line per presentation: find the item by camera or by name,
/// then Entry. The sheet closes when the line lands on the purchase.
///
/// Entry replaces the root rather than being pushed, because the item can
/// resolve several screens deep and those collapse to the root in one pass.
struct PurchaseLineSheet: View {
    enum Start: Identifiable {
        case scan
        case search

        var id: Self { self }
    }

    let model: PurchaseLogModel
    let start: Start

    @Environment(\.dismiss) private var dismiss
    @Environment(\.modelContext) private var context

    var body: some View {
        NavigationStack {
            Group {
                if let line = model.pendingLine {
                    LineEntryView(model: model, line: line)
                        .transition(.push(from: .trailing))
                } else {
                    switch start {
                    case .scan:
                        BarcodeResolutionFlow(model: model.resolver)
                    case .search:
                        CatalogSearchForm(
                            prompt: "Search your products and cases…",
                            emptyText: "Nothing matches.",
                            results: { model.searchResults(query: $0, context: context) },
                            onSelect: { model.add($0) }
                        )
                        .navigationTitle("Add an item")
                        .navigationBarTitleDisplayMode(.inline)
                    }
                }
            }
            .animation(.default, value: model.pendingLine == nil)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
            }
        }
        // A new case's name and line belong to the purchase, which the
        // resolver screens can't otherwise reach.
        .environment(model)
        // From Entry's Add, or straight from a new case.
        .onChange(of: model.rows.count) { _, _ in dismiss() }
        // On the sheet's root, where presentation modifiers take effect.
        .presentationDetents([.large])
    }
}
