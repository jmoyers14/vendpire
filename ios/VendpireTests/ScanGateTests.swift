import XCTest

@testable import Vendpire

/// The rule that stopped one box from scanning four times. VisionKit re-adds
/// the same physical barcode under a fresh tracking id whenever it loses and
/// re-acquires focus, so the gate has to judge by code and clock instead.
final class ScanGateTests: XCTestCase {
    private let start = Date(timeIntervalSince1970: 1_000_000)

    func testAFirstReadIsAccepted() {
        var gate = ScanGate()

        XCTAssertTrue(gate.shouldAccept("00049000042559", at: start))
    }

    func testAReRecognitionOfTheSameCodeIsRefused() {
        var gate = ScanGate()
        _ = gate.shouldAccept("00049000042559", at: start)

        // What VisionKit actually does: several adds in quick succession, each
        // with a new tracking id, while one box sits in front of the lens.
        for offset in [0.05, 0.3, 0.9, 1.9] {
            XCTAssertFalse(
                gate.shouldAccept("00049000042559", at: start.addingTimeInterval(offset)),
                "a repeat at +\(offset)s is the same box, not another one"
            )
        }
    }

    func testTheSameCodeIsAcceptedAgainAfterTheRefractoryPeriod() {
        var gate = ScanGate()
        _ = gate.shouldAccept("00049000042559", at: start)

        let later = start.addingTimeInterval(ScanGate.refractoryPeriod)

        XCTAssertTrue(
            gate.shouldAccept("00049000042559", at: later),
            "a second identical item, deliberately scanned, has to register"
        )
    }

    /// The window is per code. Working along a shelf of different products
    /// must never be throttled by the previous one.
    func testADifferentCodeIsNeverBlockedByAnother() {
        var gate = ScanGate()
        _ = gate.shouldAccept("00049000042559", at: start)

        XCTAssertTrue(gate.shouldAccept("00012345678905", at: start.addingTimeInterval(0.1)))
    }

    func testTheWindowRestartsFromTheLastAcceptedRead() {
        var gate = ScanGate()
        _ = gate.shouldAccept("00049000042559", at: start)

        let accepted = start.addingTimeInterval(ScanGate.refractoryPeriod)
        XCTAssertTrue(gate.shouldAccept("00049000042559", at: accepted))

        XCTAssertFalse(
            gate.shouldAccept("00049000042559", at: accepted.addingTimeInterval(0.2)),
            "the clock restarts at the accepted read, not the first one"
        )
    }
}
