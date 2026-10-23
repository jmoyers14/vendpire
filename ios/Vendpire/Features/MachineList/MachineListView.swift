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
                // `destination:` builds every row's face eagerly, before the
                // list is even on screen. The face holds live queries, so that
                // costs a full join per machine and spins the render loop.
                List(machines) { machine in
                    NavigationLink(value: machine) {
                        MachineRow(machine: machine)
                    }
                }
                .navigationDestination(for: StoredMachine.self) { machine in
                    MachineFaceView(machine: machine)
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
