import SwiftUI

/// Who and when, settled before the camera comes up — the vendor is the only
/// keyboard work in an otherwise keyboard-free pass.
///
/// Constructs `PurchaseLogModel` and hands it down, so the model outlives a pop
/// and Back is a real edit rather than a restart.
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
            // Only on the way in: coming back to fix a vendor must not overwrite
            // what is typed, or raise the keyboard over a value being read.
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
