import Foundation

/// The server's verdict on this build.
///
/// Decoded leniently: an unrecognised value from a newer server reads as
/// `.none`. Walling people over a verdict we cannot interpret is the failure
/// this whole mechanism exists to avoid.
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
/// to a floor on device — the server owns how build 41 is treated, so the floor
/// can move without shipping an app.
///
/// `nil` when the value is missing or not an integer. A sentinel would be worse
/// either way: `0` walls everyone on a misread, and `Int.max` walls no one. The
/// caller skips the check instead, and the server already passes through a
/// request that reports no build.
nonisolated enum ClientBuild {
    static var current: Int? {
        parse(Bundle.main.object(forInfoDictionaryKey: "CFBundleVersion") as? String)
    }

    /// `CFBundleVersion` is permitted to be dotted (`1.2.3`), which is not a
    /// build number we can report.
    static func parse(_ raw: String?) -> Int? {
        guard let raw else { return nil }
        return Int(raw)
    }
}

/// Holds the current verdict and decides whether the wall is on screen.
///
/// Nothing here touches the network: the verdict is handed in, by the Debug
/// menu today and by the client-support check once networking exists.
@MainActor
@Observable
final class ClientSupport {
    private(set) var requirement: UpdateRequirement = .none
    private(set) var updateUrl: URL?

    /// Per-launch, and only ever for `.recommended`. Not persisted — a nudge
    /// that stays dismissed across launches is one nobody ever acts on.
    private(set) var isNudgeDismissed = false

    var isWallVisible: Bool {
        switch requirement {
        case .none: false
        case .recommended: !isNudgeDismissed
        case .required: true
        }
    }

    var isDismissible: Bool { requirement == .recommended }

    /// A changed verdict resurfaces a dismissed nudge: the situation is not the
    /// one the user waved away.
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
    /// The wall's trigger never occurs in normal development, so it has to be
    /// forced: `-updateRequirement required` as a launch argument, or the
    /// Debug section of the account screen.
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
