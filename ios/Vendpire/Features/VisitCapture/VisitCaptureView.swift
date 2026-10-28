import SwiftData
import SwiftUI

/// Counting a machine.
///
/// One-handed, standing in front of the cabinet with a bag of chips in the
/// other hand. The whole face stays on screen so going back to fix a slot is
/// one tap on a cell you can still see, and the keypad never moves.
///
/// Layout only: every rule lives in `VisitCaptureModel`, where tests reach it.
struct VisitCaptureView: View {
    let machine: StoredMachine

    @Environment(\.modelContext) private var context
    @Environment(\.dismiss) private var dismiss

    @State private var model = VisitCaptureModel()
    @State private var isReviewing = false
    @State private var isRecordingRemoval = false

    var body: some View {
        VStack(spacing: 0) {
            // A machine with no planogram yields a draft with no lines: nothing
            // to focus, so every key is inert. Saying so beats presenting a
            // complete interface that does nothing when touched.
            if model.hasLines {
                grid
                Spacer(minLength: 0)
                contextStrip
                Keypad(
                    toggleLabel: model.toggleLabel,
                    nextLabel: model.nextLabel,
                    onDigit: { model.type($0) },
                    onToggle: { model.toggleField() },
                    onNext: { isReviewing = model.advance() }
                )
            } else {
                ContentUnavailableView(
                    "Nothing to count",
                    systemImage: "tray",
                    description: Text("\(machine.name) has no planogram yet, so it has no slots to count.")
                )
            }
        }
        .navigationTitle(machine.name)
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Button("Review") { isReviewing = true }
                    .disabled(model.countedCount == 0)
            }
        }
        .sheet(isPresented: $isReviewing) {
            @Bindable var model = model

            ReviewSheet(
                summary: model.reviewSummary,
                productName: model.productName(forProductId:),
                notes: $model.notes,
                onReturnToSlot: { model.focusSlot(code: $0) },
                onSubmit: {
                    model.submit(context: context)
                    dismiss()
                }
            )
        }
        .sheet(isPresented: $isRecordingRemoval) {
            if let line = model.focusedLine, let found = line.remaining {
                RemovalSheet(
                    slotCode: line.slotCode,
                    productName: model.productName(for: line),
                    foundInSlot: found,
                    initialUnits: line.removed,
                    initialReason: line.removalReason,
                    onDone: model.recordRemoval(units:reason:)
                )
            }
        }
        .task {
            model.start(at: machine, context: context)
        }
    }

    // MARK: - Pieces

    private var grid: some View {
        GeometryReader { proxy in
            let lines = model.linesBySlotCode

            ScrollView([.horizontal, .vertical]) {
                VStack(alignment: .leading, spacing: ShelfLayout.shelfSpacing) {
                    ForEach(Array(machine.slots.enumerated()), id: \.offset) { _, shelf in
                        shelfRow(shelf, lines: lines, availableWidth: proxy.size.width)
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
        lines: [String: DraftLine],
        availableWidth: CGFloat
    ) -> some View {
        let width = ShelfLayout.cellWidth(slotCount: shelf.count, availableWidth: availableWidth)

        return HStack(spacing: ShelfLayout.cellSpacing) {
            ForEach(Array(shelf.enumerated()), id: \.offset) { _, slotCode in
                CaptureCell(
                    slotCode: slotCode,
                    line: lines[slotCode],
                    isFocused: model.focus?.slotCode == slotCode,
                    isSuspicious: model.isSuspicious(lines[slotCode]),
                    width: width
                )
                .onTapGesture { model.focusSlot(code: slotCode) }
            }
        }
    }

    /// The focused slot's full name and both numbers. The only place a product
    /// name appears while counting — a 44pt cell holds a code and one number.
    private var contextStrip: some View {
        let current = model.focusedLine

        return VStack(alignment: .leading, spacing: 6) {
            // Progress rides the strip's top edge rather than a band of its
            // own: a separate header cost 47pt, which is the difference
            // between a six-shelf machine fitting and being clipped.
            ProgressView(
                value: Double(model.countedCount),
                total: Double(max(model.totalCount, 1))
            )
            .tint(model.hasGapsBehind ? .orange : .accentColor)

            HStack(alignment: .firstTextBaseline) {
                Text(model.focusedProductName ?? "—")
                    .font(.callout)
                    .lineLimit(1)
                Spacer(minLength: 8)
                Text("\(model.countedCount)/\(model.totalCount)")
                    .font(.footnote)
                    .monospacedDigit()
                    .foregroundStyle(.secondary)
            }

            HStack(spacing: 10) {
                FieldBox(
                    label: "LEFT IN SLOT",
                    value: current?.remaining,
                    subtitle: model.focusedLastLevelText,
                    isFocused: model.field == .left
                )
                .onTapGesture { model.clear(.left) }

                FieldBox(
                    label: "ADDING",
                    value: current?.added,
                    subtitle: current?.fillText,
                    isFocused: model.field == .adding
                )
                .onTapGesture { model.clear(.adding) }

                PulledButton(
                    removed: current?.removed ?? 0,
                    isEnabled: model.canRecordRemoval,
                    action: { isRecordingRemoval = true }
                )
            }
        }
        .padding(.horizontal, ShelfLayout.padding)
        .padding(.vertical, 10)
        .background(.bar)
    }
}
