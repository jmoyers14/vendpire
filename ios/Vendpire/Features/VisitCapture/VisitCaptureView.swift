import SwiftData
import SwiftUI

/// Counting a machine.
///
/// One-handed, standing in front of the cabinet with a bag of chips in the
/// other hand. The whole face stays on screen so going back to fix a slot is
/// one tap on a cell you can still see, and the keypad never moves.
struct VisitCaptureView: View {
    private enum Field {
        case left
        case adding
    }

    let machine: StoredMachine

    @Environment(\.modelContext) private var context
    @Environment(\.dismiss) private var dismiss
    @Query private var products: [StoredProduct]

    @State private var draft: VisitDraft?
    @State private var focus: SlotKey?
    @State private var field: Field = .left
    @State private var isConfirmingSubmit = false

    var body: some View {
        VStack(spacing: 0) {
            if let draft {
                grid(draft)
                Spacer(minLength: 0)
                contextStrip(draft)
                Keypad(
                    toggleLabel: toggleLabel(draft),
                    nextLabel: nextLabel,
                    onDigit: type(_:),
                    onToggle: { field = field == .left ? .adding : .left },
                    onNext: advance
                )
            } else {
                ContentUnavailableView("Nothing to count", systemImage: "tray")
            }
        }
        .navigationTitle(machine.name)
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Button("Review") { isConfirmingSubmit = true }
                    .disabled(countedCount == 0)
            }
        }
        .confirmationDialog(
            "Submit this visit?",
            isPresented: $isConfirmingSubmit,
            titleVisibility: .visible
        ) {
            Button("Submit \(countedCount) of \(totalCount)") { submit() }
            Button("Keep counting", role: .cancel) {}
        } message: {
            if countedCount < totalCount {
                Text(
                    "\(totalCount - countedCount) slots have no count. "
                        + "They won't be treated as zero — but you also won't know what sold."
                )
            }
        }
        .task {
            guard draft == nil else { return }
            draft = try? VisitCaptureService(context: context).startVisit(at: machine)
            focus = order?.keys.first
        }
    }

    // MARK: - Pieces

    private func grid(_ draft: VisitDraft) -> some View {
        GeometryReader { proxy in
            ScrollView([.horizontal, .vertical]) {
                VStack(alignment: .leading, spacing: ShelfLayout.shelfSpacing) {
                    ForEach(Array(machine.slots.enumerated()), id: \.offset) { _, shelf in
                        shelfRow(shelf, draft: draft, availableWidth: proxy.size.width)
                    }
                }
                .padding(ShelfLayout.padding)
                .frame(
                    minWidth: proxy.size.width,
                    minHeight: proxy.size.height,
                    alignment: .topLeading
                )
            }
        }
    }

    private func shelfRow(
        _ shelf: [String],
        draft: VisitDraft,
        availableWidth: CGFloat
    ) -> some View {
        let width = ShelfLayout.cellWidth(slotCount: shelf.count, availableWidth: availableWidth)

        return HStack(spacing: ShelfLayout.cellSpacing) {
            ForEach(Array(shelf.enumerated()), id: \.offset) { _, slotCode in
                CaptureCell(
                    slotCode: slotCode,
                    line: line(forSlotCode: slotCode, in: draft),
                    isFocused: focus?.slotCode == slotCode,
                    width: width
                )
                .onTapGesture { focusSlot(slotCode, in: draft) }
            }
        }
    }

    /// The focused slot's full name and both numbers. The only place a product
    /// name appears while counting — a 44pt cell holds a code and one number.
    private func contextStrip(_ draft: VisitDraft) -> some View {
        let current = focusedLine(draft)

        return VStack(alignment: .leading, spacing: 6) {
            // Progress rides the strip's top edge rather than a band of its
            // own: a separate header cost 47pt, which is the difference
            // between a six-shelf machine fitting and being clipped.
            ProgressView(value: Double(countedCount), total: Double(max(totalCount, 1)))
                .tint(hasGapsBehind ? .orange : .accentColor)

            HStack(alignment: .firstTextBaseline) {
                Text(current.map(productName) ?? "—")
                    .font(.callout)
                    .lineLimit(1)
                Spacer(minLength: 8)
                Text("\(countedCount)/\(totalCount)")
                    .font(.footnote)
                    .monospacedDigit()
                    .foregroundStyle(.secondary)
            }

            HStack(spacing: 10) {
                FieldBox(
                    label: "LEFT IN SLOT",
                    value: current?.remaining,
                    subtitle: nil,
                    isFocused: field == .left
                )
                .onTapGesture { clear(.left) }

                FieldBox(
                    label: "ADDING",
                    value: current?.added,
                    subtitle: fillSubtitle(current),
                    isFocused: field == .adding
                )
                .onTapGesture { clear(.adding) }
            }
        }
        .padding(.horizontal, ShelfLayout.padding)
        .padding(.vertical, 10)
        .background(.bar)
    }

    // MARK: - Reading the draft

    private var order: CaptureOrder? {
        draft.map { draft in
            CaptureOrder(
                keys: draft.lines.map { SlotKey(slotCode: $0.slotCode, productId: $0.productId) }
            )
        }
    }

    private var cursor: CaptureCursor? {
        guard let draft, let order, let focus else { return nil }

        let counted = draft.lines
            .filter { $0.remaining != nil }
            .map { SlotKey(slotCode: $0.slotCode, productId: $0.productId) }

        return CaptureCursor(order: order, counted: Set(counted), focus: focus)
    }

    private var countedCount: Int {
        draft?.lines.count { $0.remaining != nil } ?? 0
    }

    private var totalCount: Int {
        draft?.lines.count ?? 0
    }

    /// The bar turns amber once `Next` has started hunting gaps.
    private var hasGapsBehind: Bool {
        if case .gap = cursor?.nextDestination { return true }
        return false
    }

    private var nextLabel: String {
        switch cursor?.nextDestination {
        case .gap: "Next gap"
        case .review: "Review"
        default: "Next"
        }
    }

    /// Shows the *other* field and its value, so the default is legible
    /// without reading the strip.
    private func toggleLabel(_ draft: VisitDraft) -> String {
        let current = focusedLine(draft)

        switch field {
        case .left: return "ADDING \(current?.added.map(String.init) ?? "—")"
        case .adding: return "‹ LEFT \(current?.remaining.map(String.init) ?? "—")"
        }
    }

    private func fillSubtitle(_ line: DraftLine?) -> String? {
        guard let line, let par = line.par else { return nil }
        guard let remaining = line.remaining else { return "par \(par)" }

        let toPar = unitsToFillPar(remaining: remaining, par: par) ?? 0
        return line.added == toPar ? "fills to par \(par)" : "\(line.added ?? 0) of par \(par) — short"
    }

    private func focusedLine(_ draft: VisitDraft) -> DraftLine? {
        focus.flatMap { key in draft.lines.first { $0.slotCode == key.slotCode } }
    }

    private func line(forSlotCode slotCode: String, in draft: VisitDraft) -> DraftLine? {
        draft.lines.first { $0.slotCode == slotCode }
    }

    private func productName(_ line: DraftLine) -> String {
        products.first { $0.id == line.productId }?.name ?? "Unknown product"
    }

    // MARK: - Acting

    private func lineIndex(_ key: SlotKey) -> Int? {
        draft?.lines.firstIndex { $0.slotCode == key.slotCode && $0.productId == key.productId }
    }

    /// Digits accumulate, so 1 then 2 is twelve. Capped at the server's limit
    /// rather than letting a stuck key produce a four-digit count.
    private func type(_ digit: Int) {
        guard let draft, let focus, let index = lineIndex(focus) else { return }

        switch field {
        case .left:
            let typed = min(999, (draft.lines[index].remaining ?? 0) * 10 + digit)
            draft.lines[index].remaining = typed
            // Recomputed on every keystroke, which is what makes the fill path
            // one digit and one tap.
            draft.lines[index].added = unitsToFillPar(remaining: typed, par: draft.lines[index].par)
        case .adding:
            draft.lines[index].added = min(999, (draft.lines[index].added ?? 0) * 10 + digit)
        }
    }

    /// Tapping a field clears it. There is no backspace key — the keypad is
    /// 1–9, 0, toggle and Next — so this is the way back from a mistype.
    private func clear(_ target: Field) {
        guard let draft, let focus, let index = lineIndex(focus) else { return }

        field = target
        switch target {
        case .left:
            draft.lines[index].remaining = nil
            draft.lines[index].added = nil
        case .adding:
            draft.lines[index].added = nil
        }
    }

    private func focusSlot(_ slotCode: String, in draft: VisitDraft) {
        guard let line = line(forSlotCode: slotCode, in: draft) else { return }

        focus = SlotKey(slotCode: line.slotCode, productId: line.productId)
        field = .left
    }

    private func advance() {
        switch cursor?.nextDestination {
        case .slot(let key), .gap(let key):
            focus = key
            field = .left
        case .review:
            isConfirmingSubmit = true
        case nil:
            break
        }
    }

    private func submit() {
        guard let draft else { return }

        _ = try? VisitCaptureService(context: context).submit(draft)
        dismiss()
    }
}
