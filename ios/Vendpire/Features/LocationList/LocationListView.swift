import SwiftData
import SwiftUI

/// The app's root: where the operator starts a route.
///
/// Reads the store directly and never consults auth — sign-in lives behind the
/// toolbar, not in front of this.
struct LocationListView: View {
    @Query(filter: StoredLocation.visible, sort: \StoredLocation.name)
    private var locations: [StoredLocation]

    var body: some View {
        NavigationStack {
            Group {
                if locations.isEmpty {
                    ContentUnavailableView(
                        "No locations",
                        systemImage: "mappin.slash",
                        description: Text("This organization has no locations yet.")
                    )
                } else {
                    List(locations) { location in
                        NavigationLink(destination: MachineListView(location: location)) {
                            LocationRow(location: location)
                        }
                    }
                }
            }
            .navigationTitle("Locations")
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    NavigationLink(destination: AccountView()) {
                        Image(systemName: "person.crop.circle")
                    }
                    .accessibilityLabel("Account")
                }
            }
        }
    }
}

private struct LocationRow: View {
    let location: StoredLocation

    var body: some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(location.name)
            if let city = location.address?.city {
                Text(city)
                    .font(.footnote)
                    .foregroundStyle(.secondary)
            }
        }
    }
}
