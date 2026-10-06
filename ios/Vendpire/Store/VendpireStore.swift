import Foundation
import SwiftData

/// The app's SwiftData schema and its containers.
///
/// One place that names every model, so tests and the app can never disagree
/// about what the store contains.
enum VendpireStore {
    static let schema = Schema([
        StoredLocation.self,
        StoredMachine.self,
        StoredProduct.self,
        StoredPack.self,
        StoredPlanogram.self,
        StoreMetadata.self,
    ])

    /// The on-disk container the app runs against.
    ///
    /// A container that cannot be opened is unrecoverable — there is no useful
    /// degraded mode for an offline-first app whose entire purpose is the local
    /// store — so this traps rather than returning an optional that every call
    /// site would have to pretend to handle.
    static func makeContainer() -> ModelContainer {
        do {
            return try ModelContainer(for: schema)
        } catch {
            fatalError("Could not open the Vendpire store: \(error)")
        }
    }

    /// An ephemeral container for tests: real SwiftData, nothing on disk.
    /// This is what lets service orchestration be tested without a simulator UI.
    static func makeInMemoryContainer() throws -> ModelContainer {
        try ModelContainer(
            for: schema,
            configurations: ModelConfiguration(isStoredInMemoryOnly: true)
        )
    }
}
