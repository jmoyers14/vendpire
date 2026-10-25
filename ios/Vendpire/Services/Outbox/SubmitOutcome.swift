import Foundation

/// What the server's answer means for a queued row.
enum SubmitOutcome: Equatable {
    /// No payload: nothing reads the visit id, and decoding a 200 body to
    /// produce one would turn a created visit into a retry.
    case accepted
    case retryable
    case unauthorized
    case noOrganization
    case blockedByUpdateFloor
    case permanent(message: String)
}

extension SubmitOutcome {
    /// Only 400 and 404 are permanent. An undocumented status is likelier a
    /// proxy than a rejected payload, and guessing permanent strands counts.
    static func forFailure(statusCode: Int, message: String?) -> SubmitOutcome {
        switch statusCode {
        case 401: .unauthorized
        case 403: .noOrganization
        case 426: .blockedByUpdateFloor
        case 400, 404:
            .permanent(message: message ?? "The server rejected this visit without saying why.")
        default: .retryable
        }
    }
}

/// Exponential, capped at an hour. `jitter` is a parameter so the curve is
/// testable, and only shortens the wait so the cap stays a real ceiling.
func backoffDelay(attemptCount: Int, jitter: Double) -> TimeInterval {
    let base: TimeInterval = 30
    let cap: TimeInterval = 3600
    // Clamped before `pow` so a long-stuck row cannot overflow the exponent.
    let doublings = min(max(0, attemptCount - 1), 20)
    let raw = min(cap, base * pow(2, Double(doublings)))
    return raw * (0.5 + 0.5 * min(max(jitter, 0), 1))
}
