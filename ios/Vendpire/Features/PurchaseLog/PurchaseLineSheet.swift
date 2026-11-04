import SwiftData
import SwiftUI

/// One receipt line per presentation: find the item by camera or by name,
/// then Entry, then Add closes the sheet.
///
/// Entry replaces the root rather than being pushed: the item can resolve from
/// several screens deep (attach, create, case contents), and those collapse
/// to the root in the same pass — the same swap the camera already does.
struct PurchaseLineSheet: View {
    enum Start: Identifiable {
        case scan
        case search

        var id: Self { self }
    }

    let model: PurchaseLogModel
    let start: Start

    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            Group {
                if let line = model.pendingLine {
                    LineEntryView(model: model, line: line, onAdd: add)
                        .transition(.push(from: .trailing))
                } else {
                    switch start {
                    case .scan:
                        BarcodeResolutionFlow(model: model.resolver)
                    case .search:
                        CatalogSearchStep(model: model)
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
        // On the sheet's root, where presentation modifiers take effect — a
        // per-branch detent pinned the sheet to the camera's height.
        .presentationDetents([.large])
    }

    /// The owner's `onDismiss` cancels whatever is left, so Add only commits.
    private func add() {
        if model.commitPendingLine() { dismiss() }
    }
}

/// "Add manually": the name-filtered catalog list the not-found sheet uses to
/// attach a code, reused to pick an item with no code involved.
private struct CatalogSearchStep: View {
    let model: PurchaseLogModel

    @Environment(\.modelContext) private var context

    @State private var query = ""

    var body: some View {
        Form {
            Section {
                TextField("Search your products and cases…", text: $query)
                    .autocorrectionDisabled()
                if !query.trimmed.isEmpty {
                    CatalogItemMatches(
                        items: model.searchResults(query: query, context: context),
                        isDisabled: false,
                        emptyText: "Nothing matches.",
                        onSelect: { item in model.add(item) }
                    )
                }
            }
        }
        .lagoonBackground()
        .navigationTitle("Add an item")
        .navigationBarTitleDisplayMode(.inline)
    }
}
