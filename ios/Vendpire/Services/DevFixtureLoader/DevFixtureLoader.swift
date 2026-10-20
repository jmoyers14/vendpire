import Foundation
import SwiftData

/// Seeds the store from the JSON fixture bundled with the app, so the UI is
/// developable with no backend running. Development scaffolding: retire it once
/// a real client feeds `MirrorWriter` instead.
///
/// Regenerate the fixture with:
/// `MONGODB_URI=... bun packages/api/scripts/exportIosFixture.ts <orgId>`
@MainActor
final class DevFixtureLoader {
    enum LoadError: Error, LocalizedError {
        case fixtureMissing(String)

        var errorDescription: String? {
            switch self {
            case .fixtureMissing(let name):
                "No bundled fixture named \(name).json. Run exportIosFixture.ts."
            }
        }
    }

    /// `nonisolated` so it can be read from this type's own default arguments,
    /// which are evaluated outside the main actor.
    nonisolated static let defaultFixtureName = "sample-org"

    private let writer: MirrorWriter
    private let bundle: Bundle
    private let fixtureName: String

    init(
        writer: MirrorWriter,
        bundle: Bundle = .main,
        fixtureName: String = DevFixtureLoader.defaultFixtureName
    ) {
        self.writer = writer
        self.bundle = bundle
        self.fixtureName = fixtureName
    }

    /// Runs on every launch, not only when the store is empty: a seed-once
    /// loader would never exercise the writer's remove-missing step. Re-applying
    /// converges, so the cost is a few hundred upserts.
    func load() throws {
        let remote = try readRemoteOrg()
        try writer.apply(remote)
    }

    func readRemoteOrg() throws -> RemoteOrg {
        guard let url = bundle.url(forResource: fixtureName, withExtension: "json") else {
            throw LoadError.fixtureMissing(fixtureName)
        }
        let data = try Data(contentsOf: url)
        return try RemoteOrg.makeDecoder().decode(RemoteOrg.self, from: data)
    }
}
