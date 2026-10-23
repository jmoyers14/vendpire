import XCTest

@testable import Vendpire

/// Nothing in the orchestration tests ever decodes a real server timestamp —
/// `StubVendpireAPI` hands back `Remote*` values directly — so this is the
/// only place a regression to the strict `.iso8601` default would be caught.
final class TolerantDateTranscoderTests: XCTestCase {
    private let transcoder = TolerantDateTranscoder()

    func testDecodesFractionalSecondsTheServerActuallySends() throws {
        let date = try transcoder.decode("2026-10-04T03:20:04.397Z")

        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = TimeZone(identifier: "UTC")!
        let components = calendar.dateComponents(
            [.year, .month, .day, .hour, .minute, .second, .nanosecond],
            from: date
        )

        XCTAssertEqual(components.year, 2026)
        XCTAssertEqual(components.month, 10)
        XCTAssertEqual(components.day, 4)
        XCTAssertEqual(components.hour, 3)
        XCTAssertEqual(components.minute, 20)
        XCTAssertEqual(components.second, 4)
        XCTAssertEqual(Int((components.nanosecond ?? 0) / 1_000_000), 397, "fractional part should survive")
    }

    func testDecodesPlainSecondsWithNoFraction() throws {
        let date = try transcoder.decode("2026-10-04T03:20:04Z")
        let fractional = try transcoder.decode("2026-10-04T03:20:04.000Z")

        XCTAssertEqual(date.timeIntervalSince1970, fractional.timeIntervalSince1970, accuracy: 0.001)
    }

    func testRoundTripsEncodeThenDecode() throws {
        let original = try transcoder.decode("2026-10-04T03:20:04.397Z")

        let encoded = try transcoder.encode(original)
        let decoded = try transcoder.decode(encoded)

        XCTAssertEqual(decoded.timeIntervalSince1970, original.timeIntervalSince1970, accuracy: 0.001)
    }

    func testEncodeEmitsFractionalSecondsLikeTheServerDoes() throws {
        let date = try transcoder.decode("2026-10-04T03:20:04.397Z")

        let encoded = try transcoder.encode(date)

        XCTAssertTrue(encoded.contains("."), "expected fractional seconds in \(encoded)")
    }

    func testThrowsOnGarbageInsteadOfReturningAWrongDate() {
        XCTAssertThrowsError(try transcoder.decode("not a date")) { error in
            XCTAssertTrue(error is DecodingError, "expected a DecodingError, got \(error)")
        }
    }

    func testThrowsOnEmptyString() {
        XCTAssertThrowsError(try transcoder.decode(""))
    }
}
