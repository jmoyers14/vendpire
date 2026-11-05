import SwiftUI

/// Everything read off the top and bottom of the receipt, settled before the
/// camera comes up: who, when, the total, and any notes. The purchase screen
/// is then just the lines.
///
/// Constructs `PurchaseLogModel` and hands it down, so the model outlives a pop
/// and Back is a real edit rather than a restart.
struct PurchaseSetupView: View {
    @State private var model = PurchaseLogModel()
    @State private var hasStartedScanning = false

    /// The whole of the vendor history available on the device: purchases are
    /// not mirrored, and the outbox that briefly carries one drains on sync.
    @AppStorage("lastPurchaseVendor") private var lastVendor = ""

    private enum Field: Hashable {
        case vendor
        case receiptTotal
        case notes
    }

    @FocusState private var focusedField: Field?

    var body: some View {
        Form {
            Section {
                TextField("Vendor, e.g. Costco", text: $model.vendor)
                    .focused($focusedField, equals: .vendor)
                    .autocorrectionDisabled()
                    .submitLabel(.next)
                    .onSubmit { focusedField = .receiptTotal }
                DatePicker("Date", selection: $model.purchasedDate, displayedComponents: .date)
            } footer: {
                Text("Both are on the receipt. The date is almost always today.")
            }

            Section {
                HStack {
                    Text("Total")
                    Spacer()
                    Text("$")
                        .foregroundStyle(.secondaryText)
                        .accessibilityHidden(true)
                    TextField("0.00", text: $model.receiptTotalText)
                        .focused($focusedField, equals: .receiptTotal)
                        .accessibilityLabel("Receipt total")
                        .keyboardType(.decimalPad)
                        .multilineTextAlignment(.trailing)
                        .monospacedDigit()
                        .frame(maxWidth: 120)
                }
                TextField("Notes, e.g. extra for the gym machine", text: $model.notes, axis: .vertical)
                    .focused($focusedField, equals: .notes)
                    .accessibilityLabel("Notes")
                    .lineLimit(1...4)
            } header: {
                Text("Receipt")
            } footer: {
                Text("Optional. The total is checked against your items before you save.")
            }

            Section {
                Button("Start scanning", action: start)
                    .buttonStyle(.primaryPill)
                    .disabled(model.vendor.trimmed.isEmpty)
                    .listRowBackground(Color.clear)
                    .listRowInsets(EdgeInsets())
            }
        }
        .lagoonBackground()
        .scrollDismissesKeyboard(.interactively)
        .navigationTitle("Log Purchase")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            // The decimal pad has no return key.
            ToolbarItemGroup(placement: .keyboard) {
                Spacer()
                Button("Done") { focusedField = nil }
                    .fontWeight(.bold)
            }
        }
        .onAppear {
            // Only on the way in: coming back to fix a vendor must not overwrite
            // what is typed, or raise the keyboard over a value being read.
            if model.vendor.isEmpty {
                model.vendor = lastVendor
                if model.vendor.isEmpty { focusedField = .vendor }
            }
        }
        .navigationDestination(isPresented: $hasStartedScanning) {
            PurchaseLogView(model: model)
        }
    }

    private func start() {
        focusedField = nil
        lastVendor = model.vendor.trimmed
        hasStartedScanning = true
    }
}
