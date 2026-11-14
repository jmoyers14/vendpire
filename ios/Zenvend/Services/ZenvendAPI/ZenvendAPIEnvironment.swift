import SwiftUI

/// `ZenvendAPI` isn't an `@Observable` class, so it can't ride in through the
/// `.environment(refresher)` shortcut `MirrorRefresher` and `OutboxSubmitter`
/// use — it needs a key of its own.
///
/// `nil` by default: a view that never receives one (a preview, say) exercises
/// the same "not connected yet" path a real cold launch hits offline, rather
/// than quietly getting a working network client it didn't ask for.
private struct ZenvendAPIKey: EnvironmentKey {
    static let defaultValue: (any ZenvendAPI)? = nil
}

extension EnvironmentValues {
    var zenvendAPI: (any ZenvendAPI)? {
        get { self[ZenvendAPIKey.self] }
        set { self[ZenvendAPIKey.self] = newValue }
    }
}
