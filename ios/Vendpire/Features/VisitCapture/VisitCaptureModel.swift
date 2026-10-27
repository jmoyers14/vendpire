import Foundation
import SwiftData

/// The capture screen's state and every mutation of it — the view model
/// ARCHITECTURE.md reserves for this screen, where visit capture brings the
/// app's first genuinely mutable UI state.
///
/// The view renders and forwards taps; the rules live here, where a test can
/// reach them: digit accumulation and its cap, the fill-to-par recompute on
/// every keystroke, what clearing a field clears, and what `Next` does to
/// focus. Presentation state (the confirm dialog) stays in the view.
@MainActor
@Observable
final class VisitCaptureModel {
    enum Field {
        case left
        case adding
    }

    private(set) var draft: VisitDraft?
    private(set) var focus: SlotKey?
    private(set) var field: Field = .left

    /// Resolved once at start. A snapshot, like the draft itself — a product
    /// renamed mid-visit keeps the name it had when counting began, and the
    /// screen is not invalidated by unrelated background syncs.
    private var productNames: [String: String] = [:]

    // MARK: - Starting

    func start(at machine: StoredMachine, context: ModelContext) {
        guard draft == nil else { return }

        draft = try? VisitCaptureService(context: context).startVisit(at: machine)
        focus = draft?.lines.first.map(\.slotKey)

        let products = (try? context.fetch(FetchDescriptor<StoredProduct>())) ?? []
        productNames = Dictionary(products.map { ($0.id, $0.name) }) { first, _ in first }
    }

    // MARK: - What the screen reads

    var hasLines: Bool {
        !(draft?.lines.isEmpty ?? true)
    }

    var totalCount: Int {
        draft?.lines.count ?? 0
    }

    var countedCount: Int {
        draft?.lines.count { $0.isCounted } ?? 0
    }

    /// One pass per body evaluation, so the grid's cells look up by key instead
    /// of each scanning every line.
    var linesBySlotCode: [String: DraftLine] {
        Dictionary((draft?.lines ?? []).map { ($0.slotCode, $0) }) { first, _ in first }
    }

    var focusedLine: DraftLine? {
        guard let focus, let draft else { return nil }
        return draft.lines.first { $0.slotKey == focus }
    }

    var focusedProductName: String? {
        focusedLine.map { productNames[$0.productId] ?? "Unknown product" }
    }

    /// The bar turns amber once `Next` has started hunting gaps.
    var hasGapsBehind: Bool {
        if case .gap = cursor?.nextDestination { return true }
        return false
    }

    var nextLabel: String {
        switch cursor?.nextDestination {
        case .gap: "Next gap"
        case .review: "Review"
        default: "Next"
        }
    }

    /// Shows the *other* field and its value, so the default is legible
    /// without reading the strip.
    var toggleLabel: String {
        switch field {
        case .left: "ADDING \(focusedLine?.added.map(String.init) ?? "—")"
        case .adding: "‹ LEFT \(focusedLine?.remaining.map(String.init) ?? "—")"
        }
    }

    private var cursor: CaptureCursor? {
        guard let draft, let focus else { return nil }

        return CaptureCursor(
            order: CaptureOrder(keys: draft.lines.map(\.slotKey)),
            counted: Set(draft.lines.filter(\.isCounted).map(\.slotKey)),
            focus: focus
        )
    }

    // MARK: - Acting

    /// Digits accumulate, so 1 then 2 is twelve. Capped at the server's limit
    /// rather than letting a stuck key produce a four-digit count.
    func type(_ digit: Int) {
        mutateFocusedLine { line in
            switch field {
            case .left:
                let typed = min(999, (line.remaining ?? 0) * 10 + digit)
                line.remaining = typed
                // Recomputed on every keystroke, which is what makes the fill
                // path one digit and one tap.
                line.added = unitsToFillPar(remaining: typed, removed: line.removed, par: line.par)
            case .adding:
                line.added = min(999, (line.added ?? 0) * 10 + digit)
            }
        }
    }

    /// A removal needs a count to be bounded by and to be submitted alongside:
    /// `makeSubmission` drops a line with no count, so a removal recorded on an
    /// uncounted slot would vanish with no error.
    var canRecordRemoval: Bool {
        focusedLine?.isCounted ?? false
    }

    /// Replaces the focused slot's removal. `units` is bounded by what was
    /// found, and zero units clears the reason with it.
    func recordRemoval(units: Int, reason: RemovalReason?) {
        mutateFocusedLine { line in
            let bounded = cappedRemoval(of: units, foundInSlot: line.remaining ?? 0)

            line.removed = bounded
            line.removedReason = bounded > 0 ? reason?.rawValue : nil
            line.added = unitsToFillPar(
                remaining: line.remaining ?? 0,
                removed: bounded,
                par: line.par
            )
        }
    }

    func toggleField() {
        field = field == .left ? .adding : .left
    }

    /// Tapping a field clears it. There is no backspace key — the keypad is
    /// 1–9, 0, toggle and Next — so this is the way back from a mistype.
    func clear(_ target: Field) {
        field = target
        mutateFocusedLine { line in
            switch target {
            case .left:
                line.remaining = nil
                line.added = nil
                // A removal with no count behind it is the silent-loss case:
                // the line would be dropped at submit and the units with it.
                line.removed = 0
                line.removedReason = nil
            case .adding:
                line.added = nil
            }
        }
    }

    func focusSlot(code: String) {
        guard let line = draft?.lines.first(where: { $0.slotCode == code }) else { return }

        focus = line.slotKey
        field = .left
    }

    /// Moves focus to wherever `Next` points. Returns true when it points at
    /// Review — showing the confirm dialog is the view's job.
    func advance() -> Bool {
        switch cursor?.nextDestination {
        case .slot(let key), .gap(let key):
            focus = key
            field = .left
            return false
        case .review:
            return true
        case nil:
            return false
        }
    }

    func submit(context: ModelContext) {
        guard let draft else { return }

        _ = try? VisitCaptureService(context: context).submit(draft)
    }

    /// The one place that resolves "the focused line" for mutation, so the
    /// guard-and-index dance exists once.
    private func mutateFocusedLine(_ mutate: (inout DraftLine) -> Void) {
        guard let draft, let focus,
              let index = draft.lines.firstIndex(where: { $0.slotKey == focus })
        else { return }

        mutate(&draft.lines[index])
    }
}
