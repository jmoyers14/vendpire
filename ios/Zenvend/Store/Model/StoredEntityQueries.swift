import Foundation
import SwiftData

/// The predicates the screens query with, kept out of the view bodies so they
/// can be tested against a store rather than only by tapping through the app.
///
/// Soft-deleted rows are excluded here, not at import: the store keeps them so
/// an older visit referencing a deleted product still resolves.

extension StoredLocation {
    static var visible: Predicate<StoredLocation> {
        #Predicate { $0.deletedAt == nil }
    }
}

extension StoredMachine {
    static func atLocation(_ locationId: String) -> Predicate<StoredMachine> {
        #Predicate { $0.locationId == locationId && $0.deletedAt == nil }
    }
}

extension StoredPlanogram {
    /// The mirror holds at most one planogram per machine: `GET /planograms/current`
    /// already resolved it server-side, so there is no version history here to
    /// filter. Comparing `effectiveFrom` against now would discard the only row
    /// the phone has and render every cell empty.
    static func forMachine(_ machineId: String) -> Predicate<StoredPlanogram> {
        #Predicate { $0.machineId == machineId && $0.deletedAt == nil }
    }

    /// Should never matter, since the server sends one. If a re-sync ever leaves
    /// two, latest wins — `findCurrentByMachine`'s rule, not a second opinion.
    static let newestFirst = [SortDescriptor(\StoredPlanogram.effectiveFrom, order: .reverse)]
}
