import Foundation

/// Build-time configuration, read back out of the generated Info.plist.
///
/// The values originate in `Config/Debug.xcconfig` and `Config/Release.xcconfig`
/// and reach the bundle through `INFOPLIST_KEY_*` build settings. Reading them
/// in exactly one place is what keeps URLs and keys out of feature code.
///
/// Named `AppEnvironment` rather than `Environment` to avoid colliding with
/// SwiftUI's `@Environment` property wrapper, which views use heavily.
enum AppEnvironment {
    /// Clerk publishable key for the instance this build authenticates against.
    static let clerkPublishableKey: String = requiredString("ClerkPublishableKey")

    /// Base URL of the Vendpire REST API. Defined now, unused until Phase 7 —
    /// the point is that there is already a right place for it.
    static let apiBaseURL: URL = {
        let raw = requiredString("VendpireAPIBaseURL")
        guard let url = URL(string: raw) else {
            fatalError("VendpireAPIBaseURL is not a valid URL: \(raw)")
        }
        return url
    }()

    /// A missing or empty value is a build misconfiguration, not a runtime
    /// condition the app could sensibly recover from — so fail loudly at the
    /// first read rather than degrade into a confusing auth failure later.
    private static func requiredString(_ key: String) -> String {
        guard let value = Bundle.main.object(forInfoDictionaryKey: key) as? String,
              !value.isEmpty
        else {
            fatalError("Missing Info.plist key '\(key)' — check Config/*.xcconfig")
        }
        return value
    }
}
