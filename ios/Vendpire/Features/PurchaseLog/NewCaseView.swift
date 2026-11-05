import SwiftUI

/// A case nobody has seen before: its name and receipt line, then its
/// contents on the next screen.
struct NewCaseView: View {
    let purchase: PurchaseLogModel
    let draft: NewCaseDraft

    @State private var isAddingContents = false
    @State private var isNameTouched = false

    var body: some View {
        Form {
            ScannedCodeSection(model: purchase.resolver)

            Section {
                TextField(
                    "e.g. Frito-Lay 30ct variety",
                    text: Binding(get: { draft.name }, set: { purchase.renameNewCase($0) })
                        .touching($isNameTouched)
                )
            } header: {
                SectionTitle("Case name")
            }

            Section {
                LineCostFields(
                    cost: Binding(get: { draft.cost }, set: { purchase.setNewCaseCost($0) }),
                    itemName: draft.name,
                    // With a name already guessed, the receipt is next.
                    focusesAmountOnAppear: !draft.name.isEmpty
                )
            } header: {
                SectionTitle("Case price & quantity")
            } footer: {
                Text("Total is the line on the receipt; Each is the price of one case.")
            }
        }
        .lagoonBackground()
        .pinnedFooter {
            Button("Add case contents") { isAddingContents = true }
                .buttonStyle(.primaryPill)
                .disabled(!draft.isReadyForContents)
        }
        .navigationTitle("New case")
        .navigationBarTitleDisplayMode(.inline)
        .navigationDestination(isPresented: $isAddingContents) {
            CaseContentsView(purchase: purchase)
        }
        // The outside guess can land after this screen opens.
        .onChange(of: purchase.resolver.pendingScan?.candidate, initial: true) { _, candidate in
            guard !isNameTouched, let candidate else { return }
            purchase.renameNewCase(candidate.displayName)
        }
    }
}
