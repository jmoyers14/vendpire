import SwiftData
import SwiftUI

/// The app's root: where the operator starts a route.
///
/// Reads the store directly and never consults auth — sign-in lives behind the
/// toolbar, not in front of this.
struct LocationListView: View {
    @Query(filter: StoredLocation.visible, sort: \StoredLocation.name)
    private var locations: [StoredLocation]

    @Environment(MirrorRefresher.self) private var refresher
    @Query private var metadata: [StoreMetadata]

    /// The badge reads the store, not the refresher: the age of the data is the
    /// fact that matters, and it outlives any one refresh attempt.
    private var stalenessText: String? {
        guard let syncedAt = metadata.first?.lastSyncedAt else { return nil }
        let age = syncedAt.formatted(.relative(presentation: .named))
        if case .failed(let message) = refresher.state {
            return "As of \(age) · \(message)"
        }
        return "As of \(age)"
    }

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
            .refreshable { await refresher.refresh() }
            .safeAreaInset(edge: .bottom) {
                if let stalenessText {
                    Text(stalenessText)
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 8)
                        .background(.bar)
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
