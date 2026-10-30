import Foundation

/// Decides whether a barcode read counts as a new scan, or is the same
/// physical item being re-recognised.
///
/// This exists because dedup cannot key on `RecognizedItem.id`. That is a
/// *tracking* id, and VisionKit ends and restarts tracking constantly — one
/// frame of motion blur, a tilt out of plane, a shaky hand — handing the same
/// barcode a brand new id every time. Keying on it let a single box scan four
/// times.
///
/// Keyed on the payload with a refractory period instead: long enough to ride
/// out re-acquisition while the item is still in front of the lens, short
/// enough that reaching into the cart for a second identical item and scanning
/// it still registers.
nonisolated struct ScanGate {
    /// Tuned by hand against a real cart. Raise it if one item still
    /// multi-fires; lower it if deliberate back-to-back scans of two identical
    /// items get swallowed.
    static let refractoryPeriod: TimeInterval = 2

    private var lastAcceptedByPayload: [String: Date] = [:]

    init() {}

    /// True the first time a payload is seen, and again only once the
    /// refractory period has passed. `now` is injectable so the window is
    /// testable without sleeping.
    mutating func shouldAccept(_ payload: String, at now: Date = Date()) -> Bool {
        if let acceptedAt = lastAcceptedByPayload[payload],
           now.timeIntervalSince(acceptedAt) < Self.refractoryPeriod {
            return false
        }

        lastAcceptedByPayload[payload] = now
        return true
    }
}
