import SwiftUI

/// The gate before Submit — read, not enforced.
///
/// Gaps are listed individually with a one-tap way back, never summarised as
/// "incomplete". Every other section is warn-only: everything records exactly
/// as entered, and the one rule with teeth (nothing counted cannot submit)
/// lives upstream in the model.
struct ReviewSheet: View {
    let summary: VisitReviewSummary
    let productName: (_ productId: String) -> String
    @Binding var notes: String
    let onReturnToSlot: (_ slotCode: String) -> Void
    let onSubmit: () -> Void

    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            Form {
                if !summary.gaps.isEmpty {
                    gapsSection
                }
                if !summary.suspiciousCounts.isEmpty {
                    suspiciousSection
                }
                if !summary.overParFills.isEmpty {
                    overParSection
                }
                if !summary.pulled.isEmpty {
                    pulledSection
                }

                Section("Notes") {
                    TextField("Anything worth remembering", text: $notes, axis: .vertical)
                        .lineLimit(1...4)
                }

                Section {
                    Button {
                        onSubmit()
                        dismiss()
                    } label: {
                        Text("Submit \(summary.countedCount) of \(summary.totalCount)")
                            .frame(maxWidth: .infinity)
                            .fontWeight(.semibold)
                    }
                }
            }
            .navigationTitle("Review")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Keep counting") { dismiss() }
                }
            }
        }
        .presentationDetents([.large])
    }

    // MARK: - Sections

    private var gapsSection: some View {
        Section {
            ForEach(summary.gaps, id: \.slotCode) { gap in
                Button {
                    onReturnToSlot(gap.slotCode)
                    dismiss()
                } label: {
                    // Concrete colors, not hierarchical styles: inside a
                    // Button those resolve against the tint and paint the
                    // whole row link-blue.
                    HStack(spacing: 10) {
                        Text(gap.slotCode)
                            .font(.system(.caption, design: .monospaced))
                            .foregroundStyle(Color.secondary)
                        VStack(alignment: .leading, spacing: 1) {
                            Text(productName(gap.productId))
                                .foregroundStyle(Color.primary)
                            Text(gap.lastLevel.map(lastLevelText) ?? "never counted")
                                .font(.caption)
                                .foregroundStyle(Color.secondary)
                        }
                        Spacer()
                        Image(systemName: "chevron.backward")
                            .font(.caption)
                            .foregroundStyle(.tint)
                    }
                }
            }
        } header: {
            Text("\(summary.gaps.count) slots have no count")
        } footer: {
            // The consequence in domain language, not a scold: a gap is not a
            // zero, and pretending otherwise is the trap the whole capture
            // flow is built around.
            Text(
                "These slots will have no sales figure for this interval — "
                    + "the gap won't be treated as zero, but you also won't know what sold."
            )
        }
    }

    private var suspiciousSection: some View {
        Section("More than last fill — recount?") {
            ForEach(summary.suspiciousCounts, id: \.slotCode) { count in
                warnRow(
                    slotCode: count.slotCode,
                    productId: count.productId,
                    detail: "found \(count.remaining), left \(count.lastLevel) last time"
                )
            }
        }
    }

    private var overParSection: some View {
        Section("Filled past par") {
            ForEach(summary.overParFills, id: \.slotCode) { fill in
                warnRow(
                    slotCode: fill.slotCode,
                    productId: fill.productId,
                    detail: "will hold \(fill.levelAfter) of par \(fill.par)"
                )
            }
        }
    }

    private var pulledSection: some View {
        Section("Pulled stock") {
            ForEach(summary.pulled, id: \.slotCode) { pull in
                warnRow(
                    slotCode: pull.slotCode,
                    productId: pull.productId,
                    detail: "\(pull.units) \(pull.reason?.rawValue ?? "no reason recorded")"
                )
            }
        }
    }

    private func warnRow(slotCode: String, productId: String, detail: String) -> some View {
        HStack(spacing: 10) {
            Text(slotCode)
                .font(.system(.caption, design: .monospaced))
                .foregroundStyle(.secondary)
            Text(productName(productId))
            Spacer()
            Text(detail)
                .font(.caption)
                .foregroundStyle(.secondary)
        }
    }
}
