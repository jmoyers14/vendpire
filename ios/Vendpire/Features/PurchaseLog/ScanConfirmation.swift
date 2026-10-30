import Foundation

/// What the last scan did to the purchase, shown over the camera so that a
/// successful scan is never silent. The scanner stays up across a whole cart,
/// which means the work happens behind an opaque viewfinder — and a scan that
/// quietly worked is indistinguishable from a scanner that has stopped
/// working.
///
/// Carries `effect` because Undo has to reverse the right thing. Removing a
/// row that an *earlier* scan created would throw that scan away too, so an
/// increment steps the count back down instead.
nonisolated struct ScanConfirmation: Equatable, Identifiable, Sendable {
    enum Effect: Equatable, Sendable {
        /// The scan created the row.
        case added
        /// The row was already there and the scan bumped its count.
        case incremented
    }

    /// New for every scan, so the card re-animates and the haptic re-fires
    /// even when the same product is scanned twice in a row.
    let id = UUID()
    let rowId: UUID
    let name: String
    let isPack: Bool
    /// The row's quantity AFTER the scan. The reason the card shows a number
    /// at all: an accidental rescan is otherwise invisible until the receipt
    /// refuses to add up, and by then the cart is unpacked.
    let quantity: Int
    let effect: Effect
}
