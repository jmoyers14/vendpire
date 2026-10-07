import Foundation
import Testing

@testable import Vendpire

/// Builds a JWT-shaped string with the given payload. The signature is never
/// checked on device — the server verifies — so a placeholder is honest here.
private func makeToken(payload: [String: Any]) -> String {
    let data = try! JSONSerialization.data(withJSONObject: payload)
    let encoded = data.base64EncodedString()
        .replacingOccurrences(of: "+", with: "-")
        .replacingOccurrences(of: "/", with: "_")
        .replacingOccurrences(of: "=", with: "")
    return "header.\(encoded).signature"
}

@Suite("Session token claims")
struct SessionTokenClaimsTests {
    @Test("reads the nested o.id organization claim")
    func readsNestedOrganizationClaim() throws {
        let token = makeToken(payload: [
            "sub": "user_123",
            "o": ["id": "org_abc", "rol": "admin"],
        ])

        let claims = try SessionTokenDecoder.claims(from: token)

        #expect(claims.organizationId == "org_abc")
        #expect(claims.hasOrganization)
    }

    @Test("reads the flat org_id claim")
    func readsFlatOrganizationClaim() throws {
        let token = makeToken(payload: ["sub": "user_123", "org_id": "org_legacy"])

        let claims = try SessionTokenDecoder.claims(from: token)

        #expect(claims.organizationId == "org_legacy")
    }

    /// The backend reads `claims.org_id ?? o?.id`, so the flat spelling wins
    /// when both appear. Decoding it the other way round would report an
    /// organization the server would not actually use.
    @Test("prefers org_id over o.id, matching the backend's precedence")
    func prefersFlatClaimOverNested() throws {
        let token = makeToken(payload: [
            "org_id": "org_flat",
            "o": ["id": "org_nested"],
        ])

        let claims = try SessionTokenDecoder.claims(from: token)

        #expect(claims.organizationId == "org_flat")
    }

    /// The failure this whole subtask exists to detect: a well-formed token
    /// that simply names no organization.
    @Test("reports no organization when the claim is absent")
    func reportsAbsentOrganization() throws {
        let token = makeToken(payload: ["sub": "user_123", "iss": "https://clerk.example"])

        let claims = try SessionTokenDecoder.claims(from: token)

        #expect(claims.organizationId == nil)
        #expect(claims.hasOrganization == false)
        #expect(claims.claimNames == ["iss", "sub"])
    }

    @Test("treats an empty organization id as absent")
    func treatsEmptyOrganizationIdAsAbsent() throws {
        let token = makeToken(payload: ["o": ["id": ""]])

        #expect(try SessionTokenDecoder.claims(from: token).organizationId == nil)
    }

    /// Clerk's payloads routinely contain base64url characters that standard
    /// base64 rejects, and the padding is stripped. Both must decode.
    @Test("decodes base64url payloads with stripped padding")
    func decodesBase64URLWithoutPadding() throws {
        let token = makeToken(payload: ["sub": "user_~!?>>>", "o": ["id": "org_pad"]])

        #expect(try SessionTokenDecoder.claims(from: token).organizationId == "org_pad")
    }

    @Test("lists every claim name, sorted")
    func listsClaimNames() throws {
        let token = makeToken(payload: ["sub": "u", "iat": 1, "exp": 2, "o": ["id": "org"]])

        #expect(try SessionTokenDecoder.claims(from: token).claimNames == ["exp", "iat", "o", "sub"])
    }

    @Test("rejects a token that is not three segments")
    func rejectsMalformedToken() {
        #expect(throws: SessionTokenDecodingError.malformedToken) {
            try SessionTokenDecoder.claims(from: "not.ajwt")
        }
    }

    @Test("rejects a payload that is not a JSON object")
    func rejectsNonObjectPayload() {
        let encoded = Data("[1,2,3]".utf8).base64EncodedString()
            .replacingOccurrences(of: "=", with: "")

        #expect(throws: SessionTokenDecodingError.payloadNotAnObject) {
            try SessionTokenDecoder.claims(from: "header.\(encoded).signature")
        }
    }
}
