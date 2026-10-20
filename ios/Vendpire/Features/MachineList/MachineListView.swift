import SwiftData
import SwiftUI

/// The machines at one location.
struct MachineListView: View {
    let location: StoredLocation

    @Query private var machines: [StoredMachine]

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
                List(machines) { machine in
                    NavigationLink(destination: MachineFaceView(machine: machine)) {
                        MachineRow(machine: machine)
                    }
                }
            }
        }
        .navigationTitle(location.name)
        .navigationBarTitleDisplayMode(.inline)
    }
}

private struct MachineRow: View {
    let machine: StoredMachine

    private var summary: String {
        let shelves = machine.slots.count
        let slots = machine.slots.reduce(0) { $0 + $1.count }
        return "\(shelves) shelves · \(slots) slots"
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(machine.name)
            Text(summary)
                .font(.footnote)
                .foregroundStyle(.secondary)
        }
    }
}
