import Foundation

extension String {
    /// Text fields arrive with whatever the keyboard left behind. Shared across
    /// the purchase flow, where every entry field is read this way.
    var trimmed: String { trimmingCharacters(in: .whitespacesAndNewlines) }
}
