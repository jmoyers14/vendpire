import SwiftUI

/// Recording units that left a slot without being sold.
///
/// A half sheet, so the face stays visible behind it and the operator does not
/// lose their place. Takes plain values — the model owns the rules.
struct RemovalSheet: View {
    let slotCode: String
    let productName: String
    /// What was found in the slot. The removal cannot exceed it.
    let foundInSlot: Int

    let onDone: (_ units: Int, _ reason: RemovalReason?) -> Void

    @Environment(\.dismiss) private var dismiss
    @State private var units: Int
    @State private var reason: RemovalReason?

    init(
        slotCode: String,
        productName: String,
        foundInSlot: Int,
        initialUnits: Int,
        initialReason: RemovalReason?,
        onDone: @escaping (_ units: Int, _ reason: RemovalReason?) -> Void
    ) {
        self.slotCode = slotCode
        self.productName = productName
        self.foundInSlot = foundInSlot
        self.onDone = onDone
        _units = State(initialValue: initialUnits)
        _reason = State(initialValue: initialReason)
    }

    /// The server rejects a removal with no reason, and catching it here beats
    /// a 400 discovered hours later in the drain.
    private var canFinish: Bool {
        units == 0 || reason != nil
    }

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    Stepper(value: $units, in: 0...max(foundInSlot, 0)) {
                        HStack {
                            Text("How many?")
                            Spacer()
                            Text("\(units)")
                                .font(.title3)
                                .monospacedDigit()
                                .fontWeight(.semibold)
                        }
                    }
                    .onChange(of: units) { _, now in
                        // Presentation only — the model enforces the invariant.
                        // Without this, stepping 2 → 0 → 1 would resurrect a
                        // stale checkmark.
                        if now == 0 { reason = nil }
                    }
                } header: {
                    Text(productName)
                } footer: {
                    Text("Of the \(foundInSlot) you found in \(slotCode).")
                }

                if units > 0 {
                    reasonSection(for: .writtenOff)
                    reasonSection(for: .returnedToStock)
                }
            }
            .navigationTitle("Pulled from \(slotCode)")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Done") {
                        onDone(units, reason)
                        dismiss()
                    }
                    .disabled(!canFinish)
                }
            }
        }
        .presentationDetents([.medium, .large])
    }

    /// Grouped by what the choice costs rather than listed as five words: the
    /// reason decides whether these units are a loss or still inventory, and
    /// that is the distinction worth surfacing at the moment of choosing.
    private func reasonSection(for disposition: RemovalDisposition) -> some View {
        Section {
            ForEach(disposition.reasons, id: \.self) { option in
                Button {
                    reason = option
                } label: {
                    HStack {
                        Text(option.label)
                            .foregroundStyle(.primary)
                        Spacer()
                        if reason == option {
                            Image(systemName: "checkmark")
                                .foregroundStyle(.tint)
                        }
                    }
                }
            }
        } header: {
            Text(disposition.headline)
        }
    }
}

// MARK: - The sheet's copy

/// UI prose, deliberately NOT in Domain/: the server twin carries no copy and
/// the mirror argument that justifies `RemovalReason` living there stops at the
/// enum and its disposition. A designer hunting this text should find it here.
private extension RemovalDisposition {
    var headline: String {
        switch self {
        case .writtenOff: "Written off — you paid, nobody will"
        case .returnedToStock: "Back to the van — still your stock"
        }
    }

    /// Derived from the Domain table rather than listed, so a reason added or
    /// moved there cannot leave this grouping behind.
    var reasons: [RemovalReason] {
        RemovalReason.allCases.filter { $0.disposition == self }
    }
}

private extension RemovalReason {
    var label: String {
        rawValue.capitalized
    }
}
