import SwiftUI

/// One slot while counting. Slot code and the number typed into it — the
/// product name is in the strip, because 44pt holds a code and one number.
struct CaptureCell: View {
    let slotCode: String
    let line: DraftLine?
    let isFocused: Bool
    let width: CGFloat

    private var isCountable: Bool { line != nil }
    private var isCounted: Bool { line?.remaining != nil }

    var body: some View {
        VStack(spacing: 2) {
            Text(slotCode)
                .font(.system(.caption2, design: .monospaced))
                .foregroundStyle(.secondary)
            Text(countText)
                .font(.caption)
                .monospacedDigit()
                .fontWeight(isCounted ? .semibold : .regular)
        }
        .lineLimit(1)
        .minimumScaleFactor(0.8)
        .frame(width: width, height: ShelfLayout.cellHeight)
        .background(background)
        .overlay(border)
    }

    /// A blank cell and a counted zero must stay distinguishable: a missing
    /// count is not a zero.
    private var countText: String {
        guard isCountable else { return "—" }
        guard let remaining = line?.remaining else { return "·" }
        return "\(remaining)"
    }

    @ViewBuilder
    private var background: some View {
        if isCounted {
            RoundedRectangle(cornerRadius: 8).fill(.green.opacity(0.14))
        } else if isCountable {
            RoundedRectangle(cornerRadius: 8).fill(.quaternary)
        } else {
            Color.clear
        }
    }

    @ViewBuilder
    private var border: some View {
        if isFocused {
            RoundedRectangle(cornerRadius: 8).strokeBorder(.tint, lineWidth: 2)
        } else if isCountable {
            RoundedRectangle(cornerRadius: 8).strokeBorder(.quaternary, lineWidth: 1)
        } else {
            RoundedRectangle(cornerRadius: 8)
                .strokeBorder(.tertiary, style: StrokeStyle(lineWidth: 1, dash: [4, 3]))
        }
    }
}

/// One of the two numbers, with the focused one ringed.
struct FieldBox: View {
    let label: String
    let value: Int?
    let subtitle: String?
    let isFocused: Bool

    var body: some View {
        VStack(alignment: .leading, spacing: 1) {
            Text(label)
                .font(.system(size: 10, weight: .medium, design: .monospaced))
                .foregroundStyle(.secondary)
            Text(value.map(String.init) ?? "—")
                .font(.title3)
                .monospacedDigit()
            Text(subtitle ?? " ")
                .font(.caption2)
                .foregroundStyle(.secondary)
                .lineLimit(1)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.horizontal, 10)
        .padding(.vertical, 6)
        .background(RoundedRectangle(cornerRadius: 8).fill(.quaternary))
        .overlay {
            if isFocused {
                RoundedRectangle(cornerRadius: 8).strokeBorder(.tint, lineWidth: 2)
            }
        }
    }
}

/// 1–9, then 0, the toggle, and Next.
///
/// The toggle sits in the middle, under the thumb, because it is the only key
/// whose target changes — and it shows the other field's value so the default
/// is legible without reading the strip.
struct Keypad: View {
    let toggleLabel: String
    let nextLabel: String
    let onDigit: (Int) -> Void
    let onToggle: () -> Void
    let onNext: () -> Void

    private let rows = [[1, 2, 3], [4, 5, 6], [7, 8, 9]]

    var body: some View {
        VStack(spacing: 6) {
            ForEach(rows, id: \.self) { row in
                HStack(spacing: 6) {
                    ForEach(row, id: \.self) { digit in
                        key("\(digit)") { onDigit(digit) }
                    }
                }
            }
            HStack(spacing: 6) {
                key("0") { onDigit(0) }
                key(toggleLabel, font: .caption, action: onToggle)
                key(nextLabel, font: .callout, action: onNext)
            }
        }
        .padding(.horizontal, 10)
        .padding(.bottom, 8)
        .padding(.top, 6)
    }

    private func key(
        _ title: String,
        font: Font = .title2,
        action: @escaping () -> Void
    ) -> some View {
        Button(action: action) {
            Text(title)
                .font(font)
                .monospacedDigit()
                .lineLimit(1)
                .minimumScaleFactor(0.6)
                .frame(maxWidth: .infinity, minHeight: 48)
        }
        .buttonStyle(.bordered)
    }
}

/// The removals affordance, beside the two numbers.
///
/// Inert until the slot is counted: `remaining` is what was in the slot BEFORE
/// anything was pulled, and a line with no count is dropped at submit — so a
/// removal recorded first would vanish without a trace.
struct PulledButton: View {
    let removed: Int
    let isEnabled: Bool
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            VStack(spacing: 1) {
                Text("PULLED")
                    .font(.system(size: 10, weight: .medium, design: .monospaced))
                Text(removed > 0 ? "\(removed)" : "—")
                    .font(.title3)
                    .monospacedDigit()
            }
            .frame(maxWidth: .infinity)
            .padding(.vertical, 6)
        }
        .buttonStyle(.plain)
        .foregroundStyle(labelStyle)
        .frame(maxWidth: 78)
        .background(RoundedRectangle(cornerRadius: 8).fill(.quaternary))
        .disabled(!isEnabled)
        .accessibilityLabel(removed > 0 ? "Pulled \(removed)" : "Record pulled stock")
        .accessibilityHint(isEnabled ? "" : "Count the slot first")
    }

    private var labelStyle: AnyShapeStyle {
        if !isEnabled { return AnyShapeStyle(.tertiary) }
        return removed > 0 ? AnyShapeStyle(.tint) : AnyShapeStyle(.primary)
    }
}
