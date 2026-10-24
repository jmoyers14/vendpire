import SwiftData
import SwiftUI

/// The machine face. Resolves the machine's planogram and product names out
/// of the mirror and hands plain values to `FaceGrid`.
///
/// Products are fetched unfiltered on purpose: a soft-deleted product still
/// has to resolve, or its cell goes blank for no visible reason.
struct MachineFaceView: View {
    let machine: StoredMachine

    @Query private var planograms: [StoredPlanogram]
    @Query private var products: [StoredProduct]

    init(machine: StoredMachine) {
        self.machine = machine
        _planograms = Query(
            filter: StoredPlanogram.forMachine(machine.id),
            sort: StoredPlanogram.newestFirst
        )
    }

    private var face: MachineFace {
        MachineFace(
            slots: machine.slots,
            planogramSlots: planograms.first?.slots ?? [],
            productNames: Dictionary(products.map { ($0.id, $0.name) }) { first, _ in first }
        )
    }

    var body: some View {
        FaceGrid(face: face)
            .navigationTitle(machine.name)
            .navigationBarTitleDisplayMode(.inline)
    }
}

/// One row per shelf, walked in the order `slots` is stored.
///
/// Layout is never inferred from the codes. Real machines mix `A0 A2 A4 A6`
/// with bare letters and shelves of differing widths, so a shelf's width is
/// whatever the authored row says it is.
///
/// Every shelf spans the full width and cell width falls out of the slot
/// count, so a 4-slot shelf shows four wide cells and a 7-slot shelf seven
/// narrow ones. Mirrors the web's SlotFaceGrid.
///
/// Takes plain values rather than reading the store itself, so the layout can
/// be exercised without a container behind it.
struct FaceGrid: View {
    let face: MachineFace

    /// Which shelf is held open. Nil when nothing is being pressed.
    @State private var peekedShelf: Int?

    var body: some View {
        GeometryReader { proxy in
            // One scroll view around every shelf rather than one each, so the
            // rows stay aligned when a wide shelf overflows.
            ScrollView([.horizontal, .vertical]) {
                VStack(alignment: .leading, spacing: ShelfLayout.shelfSpacing) {
                    ForEach(Array(face.rows.enumerated()), id: \.offset) { index, shelf in
                        shelfRow(shelf, at: index, availableWidth: proxy.size.width)
                    }
                }
                .padding(ShelfLayout.padding)
                // A two-axis ScrollView centres content smaller than its
                // viewport, and the whole cabinet usually fits. Growing the
                // content to the viewport pins the top shelf to the top.
                .frame(
                    minWidth: proxy.size.width,
                    minHeight: proxy.size.height,
                    alignment: .topLeading
                )
            }
        }
    }

    @ViewBuilder
    private func shelfRow(_ shelf: [FaceCell], at index: Int, availableWidth: CGFloat) -> some View {
        let width = ShelfLayout.cellWidth(slotCount: shelf.count, availableWidth: availableWidth)

        Group {
            if peekedShelf == index {
                ShelfPeek(
                    shelf: shelf,
                    width: ShelfLayout.rowWidth(
                        slotCount: shelf.count,
                        availableWidth: availableWidth
                    )
                )
            } else {
                HStack(spacing: ShelfLayout.cellSpacing) {
                    ForEach(Array(shelf.enumerated()), id: \.offset) { _, cell in
                        SlotCell(cell: cell, width: width, height: ShelfLayout.cellHeight)
                    }
                }
            }
        }
        .onLongPressGesture(
            minimumDuration: 0.3,
            perform: { peekedShelf = index },
            onPressingChanged: { isPressing in
                if !isPressing {
                    peekedShelf = nil
                }
            }
        )
    }
}

/// Slot code over price. Product name and par are too wide for a 45pt cell and
/// live in the shelf peek instead.
private struct SlotCell: View {
    let cell: FaceCell
    let width: CGFloat
    let height: CGFloat

    var body: some View {
        VStack(spacing: 2) {
            Text(cell.slotCode)
                .font(.system(.caption2, design: .monospaced))
                .foregroundStyle(.secondary)
            Text(cell.priceCents.map { priceText(cents: $0) } ?? "—")
                .font(.caption2)
                .monospacedDigit()
                .foregroundStyle(cell.state == .empty ? .tertiary : .primary)
        }
        .lineLimit(1)
        .minimumScaleFactor(0.8)
        .frame(width: width, height: height)
        .background(background)
        .overlay(border)
    }

    @ViewBuilder
    private var background: some View {
        if cell.state == .empty {
            Color.clear
        } else {
            RoundedRectangle(cornerRadius: 8).fill(.quaternary)
        }
    }

    @ViewBuilder
    private var border: some View {
        if cell.state == .empty {
            RoundedRectangle(cornerRadius: 8)
                .strokeBorder(
                    .tertiary,
                    style: StrokeStyle(lineWidth: 1, dash: [4, 3])
                )
        } else {
            RoundedRectangle(cornerRadius: 8).strokeBorder(.quaternary, lineWidth: 1)
        }
    }
}

/// A held shelf, expanded in place: the only way to read a product name.
private struct ShelfPeek: View {
    let shelf: [FaceCell]
    let width: CGFloat

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            ForEach(Array(shelf.enumerated()), id: \.offset) { _, cell in
                HStack(spacing: 10) {
                    Text(cell.slotCode)
                        .font(.system(.caption, design: .monospaced))
                        .foregroundStyle(.secondary)
                        .frame(width: 30, alignment: .leading)
                    Text(name(for: cell))
                        .font(.callout)
                        .foregroundStyle(cell.state == .assigned ? .primary : .secondary)
                    Spacer(minLength: 8)
                    if let par = cell.par {
                        Text("par \(par)")
                            .font(.caption)
                            .monospacedDigit()
                            .foregroundStyle(.secondary)
                    }
                    if let priceCents = cell.priceCents {
                        Text(priceText(cents: priceCents))
                            .font(.caption)
                            .monospacedDigit()
                            .frame(width: 52, alignment: .trailing)
                    }
                }
                .lineLimit(1)
            }
        }
        .padding(10)
        .frame(width: max(width, 220), alignment: .leading)
        .background(RoundedRectangle(cornerRadius: 8).fill(.quaternary))
    }

    private func name(for cell: FaceCell) -> String {
        switch cell.state {
        case .assigned: cell.productName ?? ""
        case .empty: "empty"
        case .unknownProduct: "Unknown product"
        }
    }
}

/// Seeded from the bundled fixture rather than a signed-in store, so the
/// ragged-shelf check is one click instead of a sign-in and a sync.
@MainActor
private func fixturePreview(machineNamed name: String) -> AnyView {
    do {
        let container = try VendpireStore.makeInMemoryContainer()
        let context = ModelContext(container)
        try DevFixtureLoader(writer: MirrorWriter(context: context)).load()

        let machines = try context.fetch(FetchDescriptor<StoredMachine>())
        guard let machine = machines.first(where: { $0.name == name }) else {
            return AnyView(Text("No machine named \(name) in the fixture"))
        }
        return AnyView(
            NavigationStack { MachineFaceView(machine: machine) }
                .modelContainer(container)
        )
    } catch {
        return AnyView(Text(error.localizedDescription))
    }
}

/// Widths [4,4,4,7,7,4], and the codes change convention partway down. 17 of
/// its 30 cells are planogrammed, so filled and empty render side by side.
#Preview("National 148 — ragged") {
    fixturePreview(machineNamed: "National 148 Snack Machine")
}

/// The uniform control: a layout bug shows up as a difference between the two.
#Preview("Small Machine — uniform") {
    fixturePreview(machineNamed: "Small Machine")
}
