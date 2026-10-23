import Foundation
import OpenAPIRuntime

/// The `DateTranscoder` the generated `Client` uses for every timestamp field.
///
/// `OpenAPIRuntime`'s default (`.iso8601`) rejects fractional seconds outright,
/// and the server emits them on every timestamp (`...T03:20:04.397Z`) — see
/// `RemoteOrg.makeDecoder()`, which hit the same problem decoding mirror
/// payloads. This transcoder applies the same fix at the client-construction
/// layer so every generated operation benefits, not just the ones that later
/// get rehydrated through `RemoteOrg`.
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
/// `nonisolated(unsafe)` because `ISO8601DateFormatter` is not `Sendable` yet is
/// documented as safe for concurrent parsing — the same guarantee `DateFormatter`
/// has carried since iOS 7. The alternative is constructing a formatter per
/// timestamp inside `decode`/`encode`, which is pure waste on a payload that is
/// mostly dates.
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
