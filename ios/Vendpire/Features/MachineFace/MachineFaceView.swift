import SwiftData
import SwiftUI

/// The machine face: one row per shelf, walked in the order `slots` is stored.
///
/// Layout is never inferred from the codes. Real machines mix `A0 A2 A4 A6`
/// with bare letters and shelves of differing widths, so a shelf's width is
/// whatever the authored row says it is.
///
/// Cells show slot codes only — product, par and price arrive with the grid.
struct MachineFaceView: View {
    let machine: StoredMachine

    var body: some View {
        ScrollView([.horizontal, .vertical]) {
            VStack(alignment: .leading, spacing: 8) {
                ForEach(Array(machine.slots.enumerated()), id: \.offset) { _, shelf in
                    HStack(spacing: 8) {
                        ForEach(shelf, id: \.self) { slotCode in
                            SlotCell(slotCode: slotCode)
                        }
                    }
                }
            }
            .padding()
        }
        .navigationTitle(machine.name)
        .navigationBarTitleDisplayMode(.inline)
    }
}

private struct SlotCell: View {
    let slotCode: String

    var body: some View {
        Text(slotCode)
            .font(.system(.footnote, design: .monospaced))
            .frame(width: 56, height: 56)
            .background(.quaternary, in: RoundedRectangle(cornerRadius: 8))
    }
}
