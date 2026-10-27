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

    let initialUnits: Int
    let initialReason: RemovalReason?

    let onDone: (Int, RemovalReason?) -> Void

    @Environment(\.dismiss) private var dismiss
    @State private var units: Int
    @State private var reason: RemovalReason?

    init(
        slotCode: String,
        productName: String,
        foundInSlot: Int,
        initialUnits: Int,
        initialReason: RemovalReason?,
        onDone: @escaping (Int, RemovalReason?) -> Void
    ) {
        self.slotCode = slotCode
        self.productName = productName
        self.foundInSlot = foundInSlot
        self.initialUnits = initialUnits
        self.initialReason = initialReason
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
                        // Zero units is not a removal, so it keeps no reason.
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
        let reasons = RemovalReason.allCases.filter { $0.disposition == disposition }

        return Section {
            ForEach(reasons, id: \.self) { option in
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
            Text(reasons[0].headline)
        }
    }
}
