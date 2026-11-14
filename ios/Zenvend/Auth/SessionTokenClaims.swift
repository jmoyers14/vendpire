import Foundation

/// The claims carried by a Clerk session token.
///
/// This exists to answer one question, which gates the whole iOS approach:
/// does the token the phone holds name an organization? The backend's
/// `ClerkClient.verifySessionToken` reads `claims.org_id ?? o?.id`, and every
/// data procedure is `orgProtectedProcedure` — so a token without one makes
/// every future endpoint return FORBIDDEN.
///
/// Decoding is deliberately a pure function over a string: no SDK, no network,
/// no simulator, so it is tested directly.
nonisolated struct SessionTokenClaims: Equatable, Sendable {
    /// The organization id the token asserts, from either spelling the backend
    /// accepts — the modern nested `o.id` or the legacy flat `org_id`.
    let organizationId: String?

    /// Every top-level claim name present, sorted. Recorded because *which*
    /// claims appear is the evidence for the DECIDE subtask, not just whether
    /// the org one did.
    let claimNames: [String]

    /// The payload re-rendered as sorted, indented JSON, for logging verbatim.
    let prettyPrinted: String

    var hasOrganization: Bool { organizationId != nil }
}

nonisolated enum SessionTokenDecodingError: Error, Equatable {
    /// A JWT is three dot-separated segments; anything else is not one.
    case malformedToken
    /// The payload segment was not valid base64url.
    case undecodablePayload
    /// The payload decoded but was not a JSON object.
    case payloadNotAnObject
}

/// `nonisolated` deliberately: the project builds with
/// SWIFT_DEFAULT_ACTOR_ISOLATION = MainActor, which would otherwise pin this
/// pure decoder to the main actor. Logic that touches no shared state should
/// have no actor affinity — it is callable from anywhere and testable without
/// a main-actor hop.
nonisolated enum SessionTokenDecoder {
    /// Reads the claims out of a JWT's payload **without verifying the
    /// signature** — the server verifies; the app only needs to see what it
    /// was handed.
    static func claims(from token: String) throws -> SessionTokenClaims {
        let segments = token.split(separator: ".", omittingEmptySubsequences: false)
        guard segments.count == 3 else {
            throw SessionTokenDecodingError.malformedToken
        }

        guard let data = base64URLDecode(String(segments[1])) else {
            throw SessionTokenDecodingError.undecodablePayload
        }

        guard let payload = try? JSONSerialization.jsonObject(with: data),
              let object = payload as? [String: Any]
        else {
            throw SessionTokenDecodingError.payloadNotAnObject
        }

        return SessionTokenClaims(
            organizationId: organizationId(in: object),
            claimNames: object.keys.sorted(),
            prettyPrinted: prettyPrint(object)
        )
    }

    /// Both spellings the backend accepts, checked in the same order it checks
    /// them: the flat `org_id` first, then the nested `o.id`.
    private static func organizationId(in object: [String: Any]) -> String? {
        if let flat = object["org_id"] as? String, !flat.isEmpty {
            return flat
        }
        if let organization = object["o"] as? [String: Any],
           let nested = organization["id"] as? String, !nested.isEmpty {
            return nested
        }
        return nil
    }

    /// JWT uses base64url (RFC 4648 §5) and strips padding, neither of which
    /// Foundation's base64 decoder accepts.
    private static func base64URLDecode(_ segment: String) -> Data? {
        var normalized = segment
            .replacingOccurrences(of: "-", with: "+")
            .replacingOccurrences(of: "_", with: "/")
        let remainder = normalized.count % 4
        if remainder > 0 {
            normalized += String(repeating: "=", count: 4 - remainder)
        }
        return Data(base64Encoded: normalized)
    }

    private static func prettyPrint(_ object: [String: Any]) -> String {
        guard
            let data = try? JSONSerialization.data(
                withJSONObject: object,
                options: [.prettyPrinted, .sortedKeys]
            ),
            let text = String(data: data, encoding: .utf8)
        else {
            return "<unprintable>"
        }
        return text
    }
}
