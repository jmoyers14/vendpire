import Foundation
import OpenAPIRuntime

/// The `DateTranscoder` the generated `Client` uses for every timestamp field.
///
/// `OpenAPIRuntime`'s default (`.iso8601`) rejects the fractional seconds the
/// server emits on every timestamp (`...T03:20:04.397Z`) — the same problem
/// `RemoteOrg.makeDecoder()` solves for mirror payloads. This applies the same
/// fix at client construction so every generated operation benefits.
struct TolerantDateTranscoder: DateTranscoder {
    func decode(_ dateString: String) throws -> Date {
        if let date = TolerantDate.withFractionalSeconds.date(from: dateString) { return date }
        if let date = TolerantDate.plain.date(from: dateString) { return date }
        throw DecodingError.dataCorrupted(
            .init(codingPath: [], debugDescription: "Expected an ISO-8601 date, got \(dateString)")
        )
    }

    /// Matches what the server itself sends, so round-tripping a decoded value
    /// back out (e.g. in a request body) stays byte-compatible with the API.
    func encode(_ date: Date) throws -> String {
        TolerantDate.withFractionalSeconds.string(from: date)
    }
}

/// The two formatters the transcoder needs, built once.
///
/// `nonisolated(unsafe)` because `ISO8601DateFormatter` isn't `Sendable` but is
/// documented safe for concurrent parsing — the same guarantee `DateFormatter`
/// has carried since iOS 7. Building one per call would be pure waste on a
/// payload that's mostly dates.
private enum TolerantDate {
    nonisolated(unsafe) static let withFractionalSeconds: ISO8601DateFormatter = {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return formatter
    }()

    nonisolated(unsafe) static let plain: ISO8601DateFormatter = {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime]
        return formatter
    }()
}
