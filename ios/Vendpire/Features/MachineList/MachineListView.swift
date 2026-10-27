import SwiftData
import SwiftUI

/// The machines at one location.
struct MachineListView: View {
    let location: StoredLocation

    @Query private var machines: [StoredMachine]

    // Queried once for the whole list, not once per row. A @Query inside a row
    // is what spun the app at 100% CPU in d05ea2f.
    @Query private var latestVisits: [StoredLatestVisit]
    @Query private var planograms: [StoredPlanogram]

    init(location: StoredLocation) {
        self.location = location
        _machines = Query(
            filter: StoredMachine.atLocation(location.id),
            sort: \StoredMachine.name
        )
    }

    var body: some View {
        Group {
            if machines.isEmpty {
                ContentUnavailableView(
                    "No machines",
                    systemImage: "shippingbox",
                    description: Text("Nothing is placed at \(location.name).")
                )
            } else {
                // `destination:` would build every row's face eagerly, before
                // the list is even on screen. The face holds live queries, so
                // that costs a full join per machine and spins the render loop.
                List(machines) { machine in
                    NavigationLink(value: machine) {
                        MachineRow(machine: machine, triage: triage(for: machine))
                    }
                }
            }
        }
        .navigationDestination(for: StoredMachine.self) { machine in
            VisitCaptureView(machine: machine)
        }
        .navigationTitle(location.name)
        .navigationBarTitleDisplayMode(.inline)
    }

    private func triage(for machine: StoredMachine) -> MachineTriage {
        let visit = latestVisits.first { $0.machineId == machine.id }
        let planogram = planograms.first { $0.machineId == machine.id }

        return MachineTriage(
            countedAt: visit?.countedAt,
            lines: visit?.lines ?? [],
            planogramSlots: planogram?.slots ?? [],
            asOf: Date()
        )
    }
}

/// Two facts and no verdict: what we left only means something beside how
/// long it has been, and the operator is the one who combines them.
private struct MachineRow: View {
    let machine: StoredMachine
    let triage: MachineTriage

    var body: some View {
        VStack(alignment: .leading, spacing: 2) {
            HStack(alignment: .firstTextBaseline) {
                Text(machine.name)
                Spacer(minLength: 8)
                Text(triage.ageText)
                    .font(.footnote)
                    .foregroundStyle(.secondary)
            }
            if let shortFill = triage.shortFillText {
                Text(shortFill)
                    .font(.footnote)
                    .foregroundStyle(.secondary)
            }
        }
    }
}
