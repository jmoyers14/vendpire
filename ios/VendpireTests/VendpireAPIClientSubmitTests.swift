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

    private func purchaseRequest() throws -> OutboxRequest {
        let submission = PurchaseSubmission(
            purchasedAt: Date(timeIntervalSince1970: 1_790_000_000),
            vendor: "Costco", lines: [], packLines: [
                .init(packId: String(repeating: "b", count: 24), qty: 1, totalCostCents: 3798),
            ],
            receiptTotalCents: nil, notes: nil, clientRequestId: "purchase-req-0001"
        )
        return OutboxRequest(kind: "purchase", clientRequestId: submission.clientRequestId,
                             payload: try PurchaseSubmission.makeEncoder().encode(submission))
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

    private func purchaseOutcome(status: Int, json: String = "{}") async throws -> SubmitOutcome {
        await makeClient(status: status, json: json).submit(try purchaseRequest())
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

    /// A full body, so the generated client's own decode runs and the `.ok`
    /// branch is exercised rather than the catch beneath it.
    func testPurchase200IsAccepted() async throws {
        let body = #"{"id":"purchase-1","purchasedAt":"2026-10-20T08:00:00Z","vendor":"Costco","lines":[],"receiptTotalCents":null,"notes":null,"clientRequestId":"purchase-req-0001","createdAt":"2026-10-20T08:00:00Z","updatedAt":"2026-10-20T08:00:00Z"}"#

        let result = try await purchaseOutcome(status: 200, json: body)

        XCTAssertEqual(result, .accepted)
    }

    func testPurchase400IsPermanentWithTheServersMessage() async throws {
        let body = #"{"message":"Unknown pack: x","code":"BAD_REQUEST"}"#

        let result = try await purchaseOutcome(status: 400, json: body)

        XCTAssertEqual(result, .permanent(message: "Unknown pack: x"))
    }

    func testPurchase401IsUnauthorized() async throws {
        let result = try await purchaseOutcome(status: 401, json: #"{"message":"no","code":"UNAUTHORIZED"}"#)

        XCTAssertEqual(result, .unauthorized)
    }

    /// The payload is a VALID visit — it would decode and succeed on the
    /// visit path. So a `.permanent` result here can only come from `kind`
    /// being consulted before any decode is attempted, not from a decode
    /// failure. The transport asserting it is never invoked rules out the
    /// other way this could pass by accident: routing to the visit path and
    /// having the network call itself fail.
    func testUnknownKindIsParkedWithoutTouchingTheNetwork() async {
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
        let validVisitPayload = try! VisitSubmission.makeEncoder().encode(submission) // swiftlint:disable:this force_try
        let client = VendpireAPIClient(
            transport: StubTransport { _, _ in
                XCTFail("an unrecognised kind must never reach the network")
                throw CancellationError()
            },
            middlewares: []
        )

        let outcome = await client.submit(
            OutboxRequest(kind: "mystery", clientRequestId: "x", payload: validVisitPayload)
        )

        guard case .permanent = outcome else {
            return XCTFail("unknown kind must park, not retry: \(outcome)")
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
