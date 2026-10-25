import HTTPTypes
import OpenAPIRuntime
import XCTest

@testable import Vendpire

/// The real client against a stubbed transport, so the HTTP-to-`SubmitOutcome`
/// mapping runs end to end without a network.
///
/// A wrong answer here is expensive both ways: permanent strands a day of
/// counts, retryable hides a bug behind infinite backoff.
@MainActor
final class VendpireAPIClientSubmitTests: XCTestCase {
    private func makeRequest() -> OutboxRequest {
        let submission = VisitSubmission(
            machineId: "6ac1c6c40bfb1cd4c63d3019",
            locationId: "6ac1c6c40bfb1cd4c63d3020",
            planogramId: nil,
            countedAt: Date(timeIntervalSince1970: 1_800_000_000),
            lines: [
                VisitSubmissionLine(
                    slotCode: "A0", productId: "6ac15fccadd3eb010d071ba2",
                    remaining: 3, added: 7, removed: 0, removedReason: nil,
                    priceCents: 175, par: 10, bestBy: nil
                )
            ],
            notes: nil,
            clientRequestId: "11111111-2222-3333-4444-5555"
        )
        // swiftlint:disable:next force_try
        let payload = try! VisitSubmission.makeEncoder().encode(submission)
        return OutboxRequest(kind: "visit", clientRequestId: submission.clientRequestId, payload: payload)
    }

    private func makeClient(
        status: Int,
        json: String = "{}"
    ) -> VendpireAPIClient {
        VendpireAPIClient(
            transport: StubTransport { _, _ in
                (HTTPResponse(status: .init(code: status)), HTTPBody(json))
            },
            middlewares: []
        )
    }

    private func outcome(status: Int, json: String = "{}") async -> SubmitOutcome {
        await makeClient(status: status, json: json).submit(makeRequest())
    }

    /// A full body, so the generated client's own decode runs and the `.ok`
    /// branch is exercised rather than the catch beneath it.
    func testACreatedVisitIsAccepted() async {
        let result = await outcome(status: 200, json: #"{"id":"visit-1","machineId":"6ac1c6c40bfb1cd4c63d3019","locationId":"6ac1c6c40bfb1cd4c63d3020","planogramId":null,"countedAt":"2027-01-15T08:00:00Z","recordedByUserId":"user-1","lines":[{"slotCode":"A0","productId":"6ac15fccadd3eb010d071ba2","remaining":3,"added":7,"removed":0,"removedReason":null,"priceCents":175,"par":10,"bestBy":null}]}"#)

        XCTAssertEqual(result, .accepted)
    }

    /// A 200 we cannot parse still means the visit exists. Treating it as a
    /// failure would resubmit something the server already stored.
    func testAnUnparseable200IsStillAccepted() async {
        let result = await outcome(status: 200, json: "not json at all")

        XCTAssertEqual(result, .accepted)
    }

    func testRejectedInputCarriesTheServersMessage() async {
        let body = #"{"message":"countedAt is in the future","code":"BAD_REQUEST"}"#

        let result = await outcome(status: 400, json: body)

        XCTAssertEqual(result, .permanent(message: "countedAt is in the future"))
    }

    func testAnExpiredTokenIsUnauthorized() async {
        let result = await outcome(status: 401, json: #"{"message":"no","code":"UNAUTHORIZED"}"#)

        XCTAssertEqual(result, .unauthorized)
    }

    func testNoOrganizationIsItsOwnOutcome() async {
        let result = await outcome(status: 403, json: #"{"message":"no org","code":"FORBIDDEN"}"#)

        XCTAssertEqual(result, .noOrganization)
    }

    func testTheVersionFloorIsNeverPermanent() async {
        let result = await outcome(status: 426, json: #"{"message":"update","code":"UPGRADE_REQUIRED"}"#)

        XCTAssertEqual(result, .blockedByUpdateFloor)
    }

    func testAServerFaultRetries() async {
        let result = await outcome(status: 500, json: #"{"message":"boom","code":"INTERNAL"}"#)

        XCTAssertEqual(result, .retryable)
    }

    func testAnUndocumentedStatusRetries() async {
        let result = await outcome(status: 429)

        XCTAssertEqual(result, .retryable)
    }

    /// Offline. The common case, and it must never read as a rejection.
    func testATransportFailureRetries() async {
        struct Offline: Error {}
        let client = VendpireAPIClient(
            transport: StubTransport { _, _ in throw Offline() },
            middlewares: []
        )

        let result = await client.submit(makeRequest())

        XCTAssertEqual(result, .retryable)
    }

    /// The payload is ours, so a decode failure is our bug. Retrying forever
    /// would hide it behind backoff.
    func testAPayloadWeCannotDecodeIsPermanent() async {
        let client = makeClient(status: 200)
        let broken = OutboxRequest(kind: "visit", clientRequestId: "x", payload: Data("nope".utf8))

        guard case .permanent = await client.submit(broken) else {
            return XCTFail("an undecodable payload must not retry forever")
        }
    }
}

/// Canned HTTP, so the generated client's own encoding and decoding run.
struct StubTransport: ClientTransport {
    let respond: @Sendable (HTTPRequest, HTTPBody?) async throws -> (HTTPResponse, HTTPBody?)

    func send(
        _ request: HTTPRequest,
        body: HTTPBody?,
        baseURL: URL,
        operationID: String
    ) async throws -> (HTTPResponse, HTTPBody?) {
        try await respond(request, body)
    }
}
