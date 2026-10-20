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
