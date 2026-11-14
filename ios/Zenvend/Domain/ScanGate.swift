import Foundation

/// Decides whether a barcode read is a new scan or the same physical item
/// being re-recognised.
///
/// Keyed on the payload, not `RecognizedItem.id`: that is a *tracking* id, and
/// VisionKit restarts tracking on any blur or tilt, handing the same barcode a
/// new one each time.
nonisolated struct ScanGate {
    /// Tuned by hand against a real cart.
    static let refractoryPeriod: TimeInterval = 2

    private var lastAcceptedByPayload: [String: Date] = [:]

    init() {}

    /// `now` is injectable so the window is testable without sleeping.
    mutating func accept(_ payload: String, at now: Date = Date()) -> Bool {
        if let acceptedAt = lastAcceptedByPayload[payload],
           now.timeIntervalSince(acceptedAt) < Self.refractoryPeriod {
            return false
        }

        lastAcceptedByPayload[payload] = now
        return true
    }
}
