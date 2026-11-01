import Foundation

/// What the last scan did to the purchase, shown over the camera: behind an
/// opaque viewfinder, a scan that quietly worked looks like a dead scanner.
///
/// Carries `effect` because Undo has to reverse the right thing — an increment
/// steps the count back down rather than removing the row.
nonisolated struct ScanConfirmation: Equatable, Identifiable, Sendable {
    enum Effect: Equatable, Sendable {
        case added
        case incremented
        /// A case, on the purchase but unfinished: no contents yet, so no count.
        case caseStarted
    }

    /// New for every scan, so the card re-animates and the haptic re-fires
    /// even when the same product is scanned twice in a row.
    let id = UUID()
    let rowId: UUID
    let name: String
    let isPack: Bool
    /// Quantity AFTER the scan — what makes an accidental rescan visible before
    /// the receipt refuses to add up.
    let quantity: Int
    let effect: Effect
}
