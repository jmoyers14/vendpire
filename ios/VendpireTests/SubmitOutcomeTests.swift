import XCTest

@testable import Vendpire

/// The policy that decides whether a day's counts are recoverable. Pure, so the
/// table can be read and tested without HTTP.
///
/// The rule under test throughout: only 400 and 404 are permanent. Everything
/// else keeps the row queued, because a draft that stops retrying is a draft
/// nobody re-enters.
final class SubmitOutcomeTests: XCTestCase {
    func testServerFaultsAreRetryable() {
        XCTAssertEqual(SubmitOutcome.forFailure(statusCode: 500, message: nil), .retryable)
        XCTAssertEqual(SubmitOutcome.forFailure(statusCode: 502, message: nil), .retryable)
        XCTAssertEqual(SubmitOutcome.forFailure(statusCode: 429, message: nil), .retryable)
    }

    func testAnExpiredTokenNeverLosesTheDraft() {
        XCTAssertEqual(SubmitOutcome.forFailure(statusCode: 401, message: nil), .unauthorized)
    }

    func testBeingOutsideAnOrganizationIsItsOwnOutcome() {
        XCTAssertEqual(SubmitOutcome.forFailure(statusCode: 403, message: nil), .noOrganization)
    }

    /// The version floor is why this exists: a blocked client must keep every
    /// draft and drain after the App Store update.
    func testTheVersionFloorIsRetryableAndNeverPermanent() {
        XCTAssertEqual(SubmitOutcome.forFailure(statusCode: 426, message: "update required"), .blockedByUpdateFloor)
    }

    func testRejectedInputIsPermanentAndCarriesTheServersWords() {
        XCTAssertEqual(
            SubmitOutcome.forFailure(statusCode: 400, message: "countedAt is in the future"),
            .permanent(message: "countedAt is in the future")
        )
        XCTAssertEqual(
            SubmitOutcome.forFailure(statusCode: 404, message: "no such machine"),
            .permanent(message: "no such machine")
        )
    }

    func testAPermanentFailureWithNoMessageStillSaysSomething() {
        guard case .permanent(let message) = SubmitOutcome.forFailure(statusCode: 400, message: nil) else {
            return XCTFail("400 must be permanent")
        }
        XCTAssertFalse(message.isEmpty, "needsAttention with a blank row tells the operator nothing")
    }

    /// A status the spec does not document is likelier a proxy or a gateway
    /// than a rejected payload, and guessing permanent would drop real counts.
    func testAnUndocumentedStatusIsRetryableNotPermanent() {
        XCTAssertEqual(SubmitOutcome.forFailure(statusCode: 418, message: nil), .retryable)
        XCTAssertEqual(SubmitOutcome.forFailure(statusCode: 599, message: nil), .retryable)
    }

    // MARK: - Backoff

    func testTheFirstRetryWaitsTheBaseInterval() {
        XCTAssertEqual(backoffDelay(attemptCount: 1, jitter: 1), 30, accuracy: 0.001)
    }

    func testEachAttemptWaitsLongerThanTheLast() {
        let delays = (1...8).map { backoffDelay(attemptCount: $0, jitter: 1) }

        for (earlier, later) in zip(delays, delays.dropFirst()) {
            XCTAssertGreaterThanOrEqual(later, earlier)
        }
    }

    func testTheWaitIsCappedAtAnHour() {
        XCTAssertEqual(backoffDelay(attemptCount: 99, jitter: 1), 3600, accuracy: 0.001)
    }

    /// Jitter spreads a fleet of phones that all lost signal in the same
    /// basement; it must never push a delay past the cap.
    func testJitterStaysWithinTheCapAtBothExtremes() {
        for attemptCount in 1...99 {
            for jitter in [0.0, 0.5, 1.0] {
                let delay = backoffDelay(attemptCount: attemptCount, jitter: jitter)
                XCTAssertGreaterThan(delay, 0)
                XCTAssertLessThanOrEqual(delay, 3600)
            }
        }
    }

    func testNoJitterHalvesTheWaitRatherThanZeroingIt() {
        XCTAssertEqual(backoffDelay(attemptCount: 1, jitter: 0), 15, accuracy: 0.001)
    }
}
