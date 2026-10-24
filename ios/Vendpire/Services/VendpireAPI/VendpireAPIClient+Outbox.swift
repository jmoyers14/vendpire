import Foundation
import HTTPTypes
import OpenAPIRuntime

/// The write edge: our stored payload in, a classified outcome out.
///
/// The only place the generated request type is touched. A spec change breaks
/// the mapping below at compile time rather than silently re-encoding a draft
/// that was captured days earlier.
extension VendpireAPIClient: OutboxSubmitting {
    func submit(_ request: OutboxRequest) async -> SubmitOutcome {
        guard
            let submission = try? VisitSubmission.makeDecoder()
                .decode(VisitSubmission.self, from: request.payload)
        else {
            // The bytes are ours, so this is a bug on this side. Retrying
            // forever would bury it under an hour of backoff.
            return .permanent(message: "This visit could not be read back from the queue.")
        }

        do {
            let response = try await client.createVisit(.init(body: .json(submission.generated)))
            return Self.outcome(for: response)
        } catch let error as ClientError {
            // The generated client decodes the response body before handing
            // back an Output, so a 200 it cannot read arrives here rather than
            // in the switch. The visit exists — the server said 2xx — and the
            // replay would return the same unreadable body on every retry, so
            // treating this as retryable loops forever on a success.
            if let code = error.response?.status.code, (200..<300).contains(code) {
                return .accepted
            }
            return .retryable
        } catch {
            // Offline, DNS, a dropped connection. The common case in a
            // basement, and it must never read as a rejection.
            return .retryable
        }
    }

    private static func outcome(for response: Operations.createVisit.Output) -> SubmitOutcome {
        switch response {
        case .ok:
            // Not parsed. A 200 we cannot read still means the visit exists,
            // and resubmitting one the server already stored is worse than
            // learning nothing from the body.
            return .accepted
        case .badRequest(let rejection):
            let message = try? rejection.body.json.message
            return .permanent(message: message ?? "The server rejected this visit.")
        case .unauthorized:
            return .unauthorized
        case .forbidden:
            return .noOrganization
        case .upgradeRequired:
            return .blockedByUpdateFloor
        case .internalServerError, .undocumented:
            return .retryable
        }
    }
}

extension VisitSubmission {
    /// Field for field into the generated request body.
    fileprivate var generated: Operations.createVisit.Input.Body.jsonPayload {
        .init(
            machineId: machineId,
            locationId: locationId,
            planogramId: planogramId,
            countedAt: countedAt,
            lines: lines.map(\.generated),
            notes: notes,
            clientRequestId: clientRequestId
        )
    }
}

extension VisitSubmissionLine {
    fileprivate typealias Generated = Operations.createVisit.Input.Body.jsonPayload.linesPayloadPayload

    fileprivate var generated: Generated {
        .init(
            slotCode: slotCode,
            productId: productId,
            remaining: remaining,
            added: added,
            removed: removed,
            // An unrecognised reason drops to nil rather than failing the
            // submit: the picker is what constrains the choice, and losing the
            // reason is far cheaper than losing the counts.
            removedReason: removedReason.flatMap(Generated.removedReasonPayload.init(rawValue:)),
            priceCents: priceCents,
            par: par,
            bestBy: bestBy
        )
    }
}
