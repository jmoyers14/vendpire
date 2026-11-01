import HTTPTypes
import OpenAPIRuntime
import XCTest

@testable import Vendpire

/// The catalog write edge — create and attach — against a stubbed transport.
///
/// What is pinned down here is the message. `response.ok` would turn a 409
/// into `RuntimeError.unexpectedResponseStatus`, whose `localizedDescription`
/// is an enum dump; the sentence the server sent names the record the barcode
/// is already on, and the not-found sheet's one-tap recovery reads it.
@MainActor
final class VendpireAPIClientCatalogTests: XCTestCase {
    private let productId = String(repeating: "a", count: 24)
    private let packId = String(repeating: "b", count: 24)

    private func makeClient(status: Int, json: String) -> VendpireAPIClient {
        VendpireAPIClient(
            transport: StubTransport { _, _ in
                (HTTPResponse(status: .init(code: status)), HTTPBody(json))
            },
            middlewares: []
        )
    }

    /// Encoded rather than hand-written: every conflict sentence worth testing
    /// has quotes around a record name in it.
    private func errorJson(message: String, code: String) throws -> String {
        let encoded = try JSONEncoder().encode(["message": message, "code": code])
        return String(decoding: encoded, as: UTF8.self)
    }

    private func productJson(upc: String) -> String {
        """
        {"id":"\(productId)","name":"Coke Zero","upc":"\(upc)","category":"drinks",\
        "taxClass":null,"imageUrl":null,"defaultPriceCents":175,"active":true,\
        "tracksExpiration":true,"createdAt":"2026-10-20T08:00:00Z",\
        "updatedAt":"2026-10-20T08:00:00Z"}
        """
    }

    func testAnAttachedBarcodeComesBackOnTheProduct() async throws {
        let client = makeClient(status: 200, json: productJson(upc: "00049000042559"))

        let product = try await client.attachProductBarcode(
            productId: productId, code: "00049000042559"
        )

        XCTAssertEqual(product.id, productId)
        XCTAssertEqual(product.upc, "00049000042559")
    }

    /// Verbatim: the record name inside this sentence is the whole point.
    func testAConflictingAttachCarriesTheServersMessage() async throws {
        let message = "Barcode 00049000042559 is already on \"Coke Zero\""
        let client = makeClient(
            status: 409, json: try errorJson(message: message, code: "CONFLICT")
        )

        do {
            _ = try await client.attachProductBarcode(
                productId: productId, code: "00049000042559"
            )
            XCTFail("a 409 must not read as a success")
        } catch {
            XCTAssertEqual(error.localizedDescription, message)
            XCTAssertEqual((error as? VendpireAPIError)?.statusCode, 409)
        }
    }

    /// The cross-kind conflict: a code already known as a single item, offered
    /// to a case. Same shape, different wording — and the sheet matches both.
    func testAPackConflictCarriesTheServersMessage() async throws {
        let message = "Barcode 10049000042556 is the unit code of \"Coke Zero\""
        let client = makeClient(
            status: 409, json: try errorJson(message: message, code: "CONFLICT")
        )

        do {
            _ = try await client.attachPackBarcode(packId: packId, code: "10049000042556")
            XCTFail("a 409 must not read as a success")
        } catch {
            XCTAssertEqual(error.localizedDescription, message)
            XCTAssertEqual((error as? VendpireAPIError)?.statusCode, 409)
        }
    }

    func testAMissingProductSaysSo() async throws {
        let client = makeClient(
            status: 404, json: try errorJson(message: "No such product", code: "NOT_FOUND")
        )

        do {
            _ = try await client.attachProductBarcode(productId: productId, code: "00049000042559")
            XCTFail("a 404 must not read as a success")
        } catch {
            XCTAssertEqual(error.localizedDescription, "No such product")
            XCTAssertEqual((error as? VendpireAPIError)?.statusCode, 404)
        }
    }

    func testARejectedProductDraftCarriesTheServersMessage() async throws {
        let client = makeClient(
            status: 400, json: try errorJson(message: "category is required", code: "BAD_REQUEST")
        )
        let draft = RemoteProductDraft(
            name: "Coke Zero", upc: nil, category: "", taxClass: nil,
            imageUrl: nil, defaultPriceCents: 175
        )

        do {
            _ = try await client.createProduct(draft)
            XCTFail("a 400 must not read as a success")
        } catch {
            XCTAssertEqual(error.localizedDescription, "category is required")
            XCTAssertEqual((error as? VendpireAPIError)?.statusCode, 400)
        }
    }

    /// A status outside the spec still has to read as a sentence rather than
    /// as a runtime enum.
    func testAnUndocumentedStatusStillReadsAsASentence() async {
        let client = makeClient(status: 418, json: "{}")
        let draft = RemotePackDraft(
            name: "Costco variety case", barcodes: ["10049000042556"],
            contents: [PackContent(productId: String(repeating: "c", count: 24), units: 20)]
        )

        do {
            _ = try await client.createPack(draft)
            XCTFail("an undocumented status must not read as a success")
        } catch {
            XCTAssertEqual((error as? VendpireAPIError)?.statusCode, 418)
            XCTAssertFalse(
                error.localizedDescription.contains("RuntimeError"),
                "got: \(error.localizedDescription)"
            )
        }
    }
}
