import XCTest

@testable import Vendpire

/// The payload is stored and decoded later, possibly by a newer build. These
/// pin the encoding so the round trip stays lossless, and the key names so a
/// rename surfaces here rather than as a 400 in the field.
final class VisitSubmissionTests: XCTestCase {
    /// Whole seconds: `countedAt` is stamped when a person starts counting a
    /// machine, so sub-second precision is not a fact worth preserving.
    private let countedAt = Date(timeIntervalSince1970: 1_800_000_000)

    private func makeSubmission(
        lines: [VisitSubmissionLine]? = nil,
        notes: String? = "left a note"
    ) -> VisitSubmission {
        VisitSubmission(
            machineId: "6ac1c6c40bfb1cd4c63d3019",
            locationId: "6ac1c6c40bfb1cd4c63d3020",
            planogramId: "6ac6c85af02aa8530f1978a2",
            countedAt: countedAt,
            lines: lines ?? [makeLine()],
            notes: notes,
            clientRequestId: "11111111-2222-3333-4444-555555555555"
        )
    }

    private func makeLine(
        removed: Int = 2,
        removedReason: String? = "expired",
        par: Int? = 10,
        bestBy: String? = "2026-12-01"
    ) -> VisitSubmissionLine {
        VisitSubmissionLine(
            slotCode: "A0",
            productId: "6ac15fccadd3eb010d071ba2",
            remaining: 3,
            added: 7,
            removed: removed,
            removedReason: removedReason,
            priceCents: 175,
            par: par,
            bestBy: bestBy
        )
    }

    private func roundTrip(_ submission: VisitSubmission) throws -> VisitSubmission {
        let bytes = try VisitSubmission.makeEncoder().encode(submission)
        return try VisitSubmission.makeDecoder().decode(VisitSubmission.self, from: bytes)
    }

    func testAFullSubmissionSurvivesTheRoundTrip() throws {
        let submission = makeSubmission()

        XCTAssertEqual(try roundTrip(submission), submission)
    }

    /// Every optional is a real distinction the server reads, so none of them
    /// may quietly become a default on the way through.
    func testTheOptionalsSurviveAsNilRatherThanBecomingDefaults() throws {
        let submission = makeSubmission(
            lines: [makeLine(removed: 0, removedReason: nil, par: nil, bestBy: nil)],
            notes: nil
        )

        let decoded = try roundTrip(submission)

        XCTAssertNil(decoded.notes)
        XCTAssertNil(decoded.lines[0].removedReason)
        XCTAssertNil(decoded.lines[0].par, "nil par and par 0 are different facts")
        XCTAssertNil(decoded.lines[0].bestBy)
    }

    func testCountedAtKeepsItsInstant() throws {
        XCTAssertEqual(try roundTrip(makeSubmission()).countedAt, countedAt)
    }

    /// The keys are the server's contract. A Swift-side rename that forgets a
    /// CodingKey would otherwise only surface as a rejected submit.
    func testTheKeysMatchTheServersSchema() throws {
        let bytes = try VisitSubmission.makeEncoder().encode(makeSubmission())
        let json = try XCTUnwrap(
            JSONSerialization.jsonObject(with: bytes) as? [String: Any]
        )

        XCTAssertEqual(
            Set(json.keys),
            ["machineId", "locationId", "planogramId", "countedAt", "lines", "notes", "clientRequestId"]
        )

        let lines = try XCTUnwrap(json["lines"] as? [[String: Any]])
        XCTAssertEqual(
            Set(lines[0].keys),
            ["slotCode", "productId", "remaining", "added", "removed", "removedReason", "priceCents", "par", "bestBy"]
        )
    }

    /// The server's `countedAt` pattern requires a zone — a timestamp with
    /// neither `Z` nor an offset is rejected.
    func testCountedAtEncodesWithAZone() throws {
        let bytes = try VisitSubmission.makeEncoder().encode(makeSubmission())
        let json = try XCTUnwrap(JSONSerialization.jsonObject(with: bytes) as? [String: Any])
        let text = try XCTUnwrap(json["countedAt"] as? String)

        XCTAssertTrue(
            text.hasSuffix("Z") || text.contains("+") || text.hasSuffix("00:00"),
            "\(text) carries no zone and the server will reject it"
        )
    }
}
