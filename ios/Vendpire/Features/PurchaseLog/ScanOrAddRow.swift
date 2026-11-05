import SwiftUI

/// Scan and Add, side by side at the top of a list. Scan is disabled without
/// a camera — only the Simulator, in practice.
struct ScanOrAddRow: View {
    let addTitle: String
    let onScan: () -> Void
    let onAdd: () -> Void

    var body: some View {
        Section {
            HStack(spacing: 12) {
                Button(action: onScan) {
                    Label("Scan", systemImage: "barcode.viewfinder")
                }
                .buttonStyle(.primaryPill)
                .disabled(!BarcodeScannerView.isSupported)
                .accessibilityHint(BarcodeScannerView.isSupported ? "" : "Scanning needs a device camera")

                Button(action: onAdd) {
                    Label(addTitle, systemImage: "plus")
                }
                .buttonStyle(.softPill)
            }
            .listRowBackground(Color.clear)
            .listRowInsets(EdgeInsets())
        }
    }
}
