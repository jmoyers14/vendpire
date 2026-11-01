import SwiftUI

/// Who and when, settled before the camera comes up.
///
/// Both values used to be rows at the top of `PurchaseLogView`, sitting between
/// the operator and the item rows they spend the whole session in — and the
/// vendor is the only keyboard work in an otherwise keyboard-free pass. Asking
/// for it first puts the typing in one place and makes a vendor-less purchase
/// unreachable rather than merely refused at save.
///
/// This screen constructs `PurchaseLogModel` and hands it down, which is what
/// makes Back a real edit instead of a restart: the model outlives the pop, so
/// rows scanned before a vendor correction are still there coming forward.
struct PurchaseSetupView: View {
    @State private var model = PurchaseLogModel()
    @State private var hasStartedScanning = false

    /// The whole of the vendor history available on the device: purchases are
    /// not mirrored, and the outbox that briefly carries one drains on sync.
    @AppStorage("lastPurchaseVendor") private var lastVendor = ""

    @FocusState private var isVendorFocused: Bool

    var body: some View {
        Form {
            Section {
                TextField("Vendor, e.g. Costco", text: $model.vendor)
                    .focused($isVendorFocused)
                    .autocorrectionDisabled()
                    .submitLabel(.done)
                DatePicker("Date", selection: $model.purchasedDate, displayedComponents: .date)
            } footer: {
                Text("Both are on the receipt. The date is almost always today.")
            }

            Section {
                Button(action: start) {
                    Text("Start scanning")
                        .frame(maxWidth: .infinity)
                }
                .buttonStyle(.borderedProminent)
                .disabled(model.vendor.trimmed.isEmpty)
            }
        }
        .navigationTitle("Log Purchase")
        .navigationBarTitleDisplayMode(.inline)
        .onAppear {
            // Only on the way in. Coming back from the purchase screen to fix a
            // vendor must not overwrite what is already typed, and must not
            // raise the keyboard over a value that is only being read.
            if model.vendor.isEmpty {
                model.vendor = lastVendor
                isVendorFocused = model.vendor.isEmpty
            }
        }
        .navigationDestination(isPresented: $hasStartedScanning) {
            PurchaseLogView(model: model)
        }
    }

    private func start() {
        lastVendor = model.vendor.trimmed
        hasStartedScanning = true
    }
}
