import Foundation

/// The server's verdict on this build. An unrecognised value decodes as
/// `.none` — never wall anyone over a verdict this build cannot interpret.
nonisolated enum UpdateRequirement: String, Decodable, Sendable {
    case none
    case recommended
    case required

    init(from decoder: any Decoder) throws {
        let raw = try decoder.singleValueContainer().decode(String.self)
        self = UpdateRequirement(rawValue: raw) ?? .none
    }
}

/// This binary's `CFBundleVersion`, reported to the server and never compared
/// to a floor here — the floor moves without shipping an app.
///
/// `nil` rather than a sentinel when unreadable: `0` walls everyone, `Int.max`
/// walls no one. The server passes through a request reporting no build.
nonisolated enum ClientBuild {
    static var current: Int? {
        parse(Bundle.main.object(forInfoDictionaryKey: "CFBundleVersion") as? String)
    }

    /// `CFBundleVersion` is permitted to be dotted (`1.2.3`).
    static func parse(_ raw: String?) -> Int? {
        guard let raw else { return nil }
        return Int(raw)
    }
}

/// Holds the current verdict and decides whether the wall is on screen. The
/// verdict is handed in; nothing here touches the network.
@MainActor
@Observable
final class ClientSupport {
    private(set) var requirement: UpdateRequirement = .none
    private(set) var updateUrl: URL?

    /// Not persisted: a nudge dismissed across launches is one nobody acts on.
    private(set) var isNudgeDismissed = false

    var isWallVisible: Bool {
        switch requirement {
        case .none: false
        case .recommended: !isNudgeDismissed
        case .required: true
        }
    }

    var isDismissible: Bool { requirement == .recommended }

    /// A changed verdict resurfaces a dismissed nudge — escalation has to reach
    /// someone who waved the first one away.
    func apply(_ requirement: UpdateRequirement, updateUrl: URL?) {
        if requirement != self.requirement {
            isNudgeDismissed = false
        }
        self.requirement = requirement
        self.updateUrl = updateUrl
    }

    func dismissNudge() {
        guard isDismissible else { return }
        isNudgeDismissed = true
    }

    #if DEBUG
    /// Forces the gate without a server: `-updateRequirement required`.
    func applyLaunchArgumentOverride(_ arguments: [String] = ProcessInfo.processInfo.arguments) {
        guard let flag = arguments.firstIndex(of: "-updateRequirement"),
              let raw = arguments[safe: flag + 1],
              let forced = UpdateRequirement(rawValue: raw)
        else { return }
        apply(forced, updateUrl: URL(string: "https://apps.apple.com/app/id000000000"))
    }
    #endif
}

private extension Array {
    subscript(safe index: Int) -> Element? {
        indices.contains(index) ? self[index] : nil
    }
}
