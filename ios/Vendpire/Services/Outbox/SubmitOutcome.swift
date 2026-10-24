import Foundation

/// What the server's answer means for a queued row.
enum SubmitOutcome: Equatable {
    /// Carries nothing on purpose. The id is unread — success deletes the row
    /// — and decoding a 200 body to produce one would let a parse failure turn
    /// a created visit into a retry.
    case accepted
    case retryable
    case unauthorized
    case noOrganization
    case blockedByUpdateFloor
    case permanent(message: String)
}

extension SubmitOutcome {
    /// The policy table for a failed submit, kept pure so the one decision that
    /// determines whether a day's counts survive can be read in one place.
    ///
    /// Only 400 and 404 are permanent. An undocumented status is likelier a
    /// proxy or a gateway than a rejected payload, and guessing permanent would
    /// strand real counts in a list nobody re-enters.
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

/// How long to wait before retrying, exponential and capped at an hour.
///
/// `jitter` is a parameter in 0...1 rather than a call to `random()` so the
/// curve and the cap are deterministically testable. It only ever shortens the
/// wait, which keeps the cap a real ceiling while still spreading a fleet of
/// phones that all lost signal in the same basement.
func backoffDelay(attemptCount: Int, jitter: Double) -> TimeInterval {
    let base: TimeInterval = 30
    let cap: TimeInterval = 3600
    // Clamped before `pow` so a long-stuck row cannot overflow the exponent.
    // The cap makes anything past the seventh attempt identical anyway.
    let doublings = min(max(0, attemptCount - 1), 20)
    let raw = min(cap, base * pow(2, Double(doublings)))
    return raw * (0.5 + 0.5 * min(max(jitter, 0), 1))
}
