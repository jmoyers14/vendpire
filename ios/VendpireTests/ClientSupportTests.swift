import XCTest

@testable import Vendpire

@MainActor
final class ClientSupportTests: XCTestCase {
    private let updateUrl = URL(string: "https://example.com/app")

    // MARK: - Gate transitions

    func testStartsClear() {
        let support = ClientSupport()

        XCTAssertEqual(support.requirement, .none)
        XCTAssertFalse(support.isWallVisible)
    }

    func testRequiredShowsAWallThatCannotBeDismissed() {
        let support = ClientSupport()
        support.apply(.required, updateUrl: updateUrl)

        XCTAssertTrue(support.isWallVisible)
        XCTAssertFalse(support.isDismissible)

        support.dismissNudge()

        XCTAssertTrue(support.isWallVisible, "a required wall must survive a dismiss attempt")
    }

    func testRecommendedIsDismissible() {
        let support = ClientSupport()
        support.apply(.recommended, updateUrl: updateUrl)
        XCTAssertTrue(support.isWallVisible)

        support.dismissNudge()

        XCTAssertFalse(support.isWallVisible)
        XCTAssertEqual(support.requirement, .recommended, "dismissing hides the nudge, not the verdict")
    }

    func testADismissedNudgeResurfacesWhenTheVerdictEscalates() {
        let support = ClientSupport()
        support.apply(.recommended, updateUrl: updateUrl)
        support.dismissNudge()

        support.apply(.required, updateUrl: updateUrl)

        XCTAssertTrue(support.isWallVisible)
    }

    func testClearingTheVerdictHidesTheWall() {
        let support = ClientSupport()
        support.apply(.required, updateUrl: updateUrl)

        support.apply(.none, updateUrl: nil)

        XCTAssertFalse(support.isWallVisible)
    }

    // MARK: - Verdict decoding

    func testDecodesTheServerVocabulary() throws {
        XCTAssertEqual(try decodeRequirement("\"none\""), .none)
        XCTAssertEqual(try decodeRequirement("\"recommended\""), .recommended)
        XCTAssertEqual(try decodeRequirement("\"required\""), .required)
    }

    func testAnUnknownVerdictReadsAsNoneRatherThanWalling() throws {
        XCTAssertEqual(try decodeRequirement("\"catastrophic\""), .none)
    }

    // MARK: - Build reporting

    func testReadsAnIntegerBundleVersion() {
        XCTAssertEqual(ClientBuild.parse("42"), 42)
    }

    func testADottedBundleVersionReportsNothingRatherThanGuessing() {
        XCTAssertNil(ClientBuild.parse("1.2.3"))
    }

    func testAMissingBundleVersionIsUnreadable() {
        XCTAssertNil(ClientBuild.parse(nil))
    }

    func testThisBuildReportsAnIntegerBuildNumber() {
        XCTAssertNotNil(ClientBuild.current, "CURRENT_PROJECT_VERSION must stay an integer")
    }

    // MARK: - Helpers

    private func decodeRequirement(_ json: String) throws -> UpdateRequirement {
        try JSONDecoder().decode(UpdateRequirement.self, from: Data(json.utf8))
    }
}
