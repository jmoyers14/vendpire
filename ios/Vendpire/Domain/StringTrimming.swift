import Foundation

extension String {
    /// Text fields arrive with whatever the keyboard left behind.
    var trimmed: String { trimmingCharacters(in: .whitespacesAndNewlines) }
}
