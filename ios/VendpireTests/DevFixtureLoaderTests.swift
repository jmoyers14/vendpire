import SwiftData
import XCTest

@testable import Vendpire

/// Decodes and applies the fixture that actually ships in the bundle — no stub
/// payload. If `exportIosFixture.ts` emits a shape the Swift types don't accept,
/// this fails here rather than as an empty screen at launch.
@MainActor
final class DevFixtureLoaderTests: XCTestCase {
    /// Hosted in the app process, so `Bundle.main` resolves the fixture exactly
    /// as it does at launch.
    private var appBundle: Bundle { .main }

    /// Held so the container outlives the context reading from it.
    ///
    /// KNOWN ISSUE: this suite crashes the runner with `malloc: pointer being
    /// freed was not allocated` before any assertion runs. `MirrorWriterTests`
    /// does the same setup and passes, so the trigger is specific to this class
    /// and is not yet identified.
    private var container: ModelContainer!
    private var context: ModelContext!

    private func makeLoader(fixtureName: String = DevFixtureLoader.defaultFixtureName) throws -> DevFixtureLoader {
        container = try VendpireStore.makeInMemoryContainer()
        context = ModelContext(container)
        return DevFixtureLoader(
            writer: MirrorWriter(context: context),
            bundle: appBundle,
            fixtureName: fixtureName
        )
    }

    func testTheBundledFixtureDecodes() throws {
        let loader = try makeLoader()

        let remote = try loader.readRemoteOrg()

        XCTAssertFalse(remote.orgId.isEmpty)
        XCTAssertFalse(remote.machines.isEmpty, "a fixture with no machines renders nothing")
        XCTAssertFalse(remote.products.isEmpty)
    }

    func testTheBundledFixtureFillsTheStore() throws {
        let loader = try makeLoader()

        try loader.load()

        let machines = try context.fetch(FetchDescriptor<StoredMachine>())
        let metadata = try context.fetch(FetchDescriptor<StoreMetadata>())

        XCTAssertFalse(machines.isEmpty)
        XCTAssertEqual(metadata.count, 1)
        XCTAssertFalse(try context.fetch(FetchDescriptor<StoredProduct>()).isEmpty)

        // Every machine must have at least one shelf, or the face grid has
        // nothing to walk.
        for machine in machines {
            XCTAssertFalse(machine.slots.isEmpty, "\(machine.name) has no shelves")
        }
    }

    /// A dangling productId renders a blank cell for no visible reason.
    func testPlanogramSlotsReferenceProductsPresentInTheFixture() throws {
        let loader = try makeLoader()
        let remote = try loader.readRemoteOrg()
        let productIds = Set(remote.products.map(\.id))

        for planogram in remote.planograms {
            for slot in planogram.slots {
                XCTAssertTrue(
                    productIds.contains(slot.productId),
                    "slot \(slot.slotCode) references product \(slot.productId), absent from the fixture"
                )
            }
        }
    }

    func testMissingFixtureIsADistinctError() throws {
        let loader = try makeLoader(fixtureName: "no-such-fixture")

        XCTAssertThrowsError(try loader.readRemoteOrg()) { error in
            guard case DevFixtureLoader.LoadError.fixtureMissing = error else {
                return XCTFail("expected fixtureMissing, got \(error)")
            }
        }
    }
}
