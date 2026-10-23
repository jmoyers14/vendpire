import XCTest

/// Routing only — that a tap pushes one screen and not two.
///
/// **Needs a device that has already mirrored Right-On Studios**, so it is not
/// safe for CI and `Scripts/xc test` skips the whole UI target. Run it by hand:
///
/// ```
/// xcodebuild -project Vendpire.xcodeproj -scheme Vendpire \
///   -destination "platform=iOS Simulator,id=<udid>" \
///   -only-testing:VendpireUITests/MachineNavigationUITests test
/// ```
///
/// Written against a real bug: mixing `NavigationLink(destination:)` with
/// `navigationDestination(for:)` in one stack pushed the machine list on top
/// of the face.
final class MachineNavigationUITests: XCTestCase {
    @MainActor
    func testTappingAMachinePushesTheFaceAndNothingElse() throws {
        let app = XCUIApplication()
        app.launchArguments = ["-skipLock"]
        app.launch()

        let location = app.staticTexts["Right-On Studios"].firstMatch
        XCTAssertTrue(location.waitForExistence(timeout: 10), "no Right-On Studios row")
        location.tap()

        let machine = app.staticTexts["National 148 Snack Machine"].firstMatch
        XCTAssertTrue(machine.waitForExistence(timeout: 10), "no machine row")
        machine.tap()

        let faceBar = app.navigationBars["National 148 Snack Machine"]
        XCTAssertTrue(faceBar.waitForExistence(timeout: 10), "face never appeared")

        // The bug: a second machine list lands on top of the face, so the
        // location's bar is showing again once the dust settles.
        let topBar = app.navigationBars.element(boundBy: app.navigationBars.count - 1)
        XCTAssertEqual(
            topBar.identifier,
            "National 148 Snack Machine",
            "something was pushed on top of the face"
        )
    }
}
