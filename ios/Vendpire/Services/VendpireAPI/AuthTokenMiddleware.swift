import ClerkKit
import Foundation
import HTTPTypes
import OpenAPIRuntime

/// Stamps a fresh Clerk token on every request.
///
/// Fetched per request, not cached: the TTL is 60 seconds, so a held token is
/// expired more often than not. A missing token is not an error here — the
/// request goes out bare and the server answers 401, which is the one place
/// that decision belongs.
struct AuthTokenMiddleware: ClientMiddleware {
    func intercept(
        _ request: HTTPRequest,
        body: HTTPBody?,
        baseURL: URL,
        operationID: String,
        next: @Sendable @concurrent (HTTPRequest, HTTPBody?, URL) async throws -> (HTTPResponse, HTTPBody?)
    ) async throws -> (HTTPResponse, HTTPBody?) {
        var request = request
        if let token = try? await Clerk.shared.auth.getToken() {
            request.headerFields[.authorization] = "Bearer \(token)"
        }
        return try await next(request, body, baseURL)
    }
}
