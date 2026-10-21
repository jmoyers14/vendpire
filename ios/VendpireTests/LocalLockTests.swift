import XCTest

@testable import Vendpire

@MainActor
final class LocalLockTests: XCTestCase {
    func testStartsLocked() {
        let lock = LocalLock(authenticator: StubAuthenticator())

        XCTAssertEqual(lock.state, .locked)
        XCTAssertFalse(lock.isUnlocked)
    }

    func testUnlocksWhenTheOwnerIsConfirmed() async {
        let lock = LocalLock(authenticator: StubAuthenticator(succeeds: true))

        await lock.unlock()

        XCTAssertTrue(lock.isUnlocked)
    }

    func testStaysLockedWhenCancelled() async {
        let lock = LocalLock(authenticator: StubAuthenticator(succeeds: false))

        await lock.unlock()

        XCTAssertEqual(lock.state, .locked)
    }

    /// A device with no passcode can only lock out the legitimate user — what
    /// it would protect is already reachable by anyone holding the phone.
    func testOpensWhenTheDeviceHasNoPasscode() async {
        let stub = StubAuthenticator(canAuthenticate: false)
        let lock = LocalLock(authenticator: stub)

        await lock.unlock()

        XCTAssertTrue(lock.isUnlocked)
        XCTAssertEqual(stub.attempts, 0, "must not prompt when there is nothing to prompt against")
    }

    func testUnlockingTwiceDoesNotPromptAgain() async {
        let stub = StubAuthenticator(succeeds: true)
        let lock = LocalLock(authenticator: stub)

        await lock.unlock()
        await lock.unlock()

        XCTAssertEqual(stub.attempts, 1)
    }

    // MARK: - The grace period

    func testReturningWithinTheGracePeriodStaysUnlocked() async {
        let lock = LocalLock(authenticator: StubAuthenticator(succeeds: true))
        let start = Date(timeIntervalSince1970: 1_000_000)
        await lock.unlock(now: start)

        lock.backgrounded(now: start.addingTimeInterval(60))
        lock.foregrounded(now: start.addingTimeInterval(90))

        XCTAssertTrue(lock.isUnlocked)
    }

    func testReturningAfterTheGracePeriodRelocks() async {
        let lock = LocalLock(authenticator: StubAuthenticator(succeeds: true))
        let start = Date(timeIntervalSince1970: 1_000_000)
        await lock.unlock(now: start)

        lock.backgrounded(now: start.addingTimeInterval(60))
        lock.foregrounded(now: start.addingTimeInterval(60 + LocalLock.graceInterval))

        XCTAssertEqual(lock.state, .locked)
    }

    /// The window is time spent away, not time since unlocking — a long
    /// session at a machine must never be interrupted.
    func testALongSessionIsNotInterrupted() async {
        let lock = LocalLock(authenticator: StubAuthenticator(succeeds: true))
        let start = Date(timeIntervalSince1970: 1_000_000)
        await lock.unlock(now: start)

        let hourIn = start.addingTimeInterval(3600)
        lock.backgrounded(now: hourIn)
        lock.foregrounded(now: hourIn.addingTimeInterval(5))

        XCTAssertTrue(lock.isUnlocked)
    }

    func testForegroundingWithoutLeavingDoesNotRelock() async {
        let lock = LocalLock(authenticator: StubAuthenticator(succeeds: true))
        let start = Date(timeIntervalSince1970: 1_000_000)
        await lock.unlock(now: start)

        lock.foregrounded(now: start.addingTimeInterval(LocalLock.graceInterval * 10))

        XCTAssertTrue(lock.isUnlocked, "never left, so there is no absence to measure")
    }
}

private final class StubAuthenticator: LocalAuthenticator, @unchecked Sendable {
    private let canAuth: Bool
    private let succeeds: Bool
    private(set) var attempts = 0

    init(canAuthenticate: Bool = true, succeeds: Bool = true) {
        self.canAuth = canAuthenticate
        self.succeeds = succeeds
    }

    func canAuthenticate() -> Bool { canAuth }

    func authenticate(reason: String) async -> Bool {
        attempts += 1
        return succeeds
    }
}
