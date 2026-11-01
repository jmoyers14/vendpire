import Foundation
import HTTPTypes
import OpenAPIRuntime

/// The write edge: our stored payload in, a classified outcome out.
///
/// The only place the generated request type is touched, so a spec change
/// breaks the mapping below at compile time.
extension VendpireAPIClient: OutboxSubmitting {
    func submit(_ request: OutboxRequest) async -> SubmitOutcome {
        switch request.kind {
        case "visit": return await submitVisit(request)
        case "purchase": return await submitPurchase(request)
        default:
            // An old app meeting a future item: park it where a human sees it.
            return .permanent(message: "This app is too old to send a \(request.kind). Update and retry.")
        }
    }

    private func submitVisit(_ request: OutboxRequest) async -> SubmitOutcome {
        guard
            let submission = try? VisitSubmission.makeDecoder()
                .decode(VisitSubmission.self, from: request.payload)
        else {
            // The bytes are ours, so this is our bug. Retrying would bury it.
            return .permanent(message: "This visit could not be read back from the queue.")
        }

        do {
            let response = try await client.createVisit(.init(body: .json(submission.generated)))
            return Self.outcome(for: response)
        } catch let error as ClientError {
            // The generated client decodes the body inside the call, so a 200
            // it cannot read lands here instead of in the switch. The visit
            // exists, and the replay returns that same body every time — so
            // retrying would loop forever on a success.
            if let code = error.response?.status.code, (200..<300).contains(code) {
                return .accepted
            }
            return .retryable
        } catch {
            // Offline. The common case, and never a rejection.
            return .retryable
        }
    }

    private func submitPurchase(_ request: OutboxRequest) async -> SubmitOutcome {
        guard
            let submission = try? PurchaseSubmission.makeDecoder()
                .decode(PurchaseSubmission.self, from: request.payload)
        else {
            // The bytes are ours, so this is our bug. Retrying would bury it.
            return .permanent(message: "This purchase could not be read back from the queue.")
        }

        do {
            let response = try await client.createPurchase(.init(body: .json(submission.generated)))
            return Self.outcome(for: response)
        } catch let error as ClientError {
            // Same reasoning as the visit path: a 200 the generated client
            // cannot decode still means the purchase exists.
            if let code = error.response?.status.code, (200..<300).contains(code) {
                return .accepted
            }
            return .retryable
        } catch {
            // Offline. The common case, and never a rejection.
            return .retryable
        }
    }

    private static func outcome(for response: Operations.createVisit.Output) -> SubmitOutcome {
        switch response {
        case .ok:
            // Not parsed: a 200 means the visit exists either way.
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

    private static func outcome(for response: Operations.createPurchase.Output) -> SubmitOutcome {
        switch response {
        case .ok:
            // Not parsed: a 200 means the purchase exists either way.
            return .accepted
        case .badRequest(let rejection):
            let message = try? rejection.body.json.message
            return .permanent(message: message ?? "The server rejected this purchase.")
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
            // submit — losing the reason is cheaper than losing the counts.
            removedReason: removedReason.flatMap(Generated.removedReasonPayload.init(rawValue:)),
            priceCents: priceCents,
            par: par,
            bestBy: bestBy
        )
    }
}

extension PurchaseSubmission {
    /// Field for field into the generated request body.
    fileprivate var generated: Operations.createPurchase.Input.Body.jsonPayload {
        .init(
            purchasedAt: purchasedAt,
            vendor: vendor,
            lines: lines.map(\.generated),
            packLines: packLines.map(\.generated),
            receiptTotalCents: receiptTotalCents,
            notes: notes,
            clientRequestId: clientRequestId
        )
    }
}

extension PurchaseSubmissionLine {
    fileprivate typealias Generated = Operations.createPurchase.Input.Body.jsonPayload.linesPayloadPayload

    fileprivate var generated: Generated {
        .init(productId: productId, units: units, totalCostCents: totalCostCents, packId: packId)
    }
}

extension PurchaseSubmissionPackLine {
    fileprivate typealias Generated = Operations.createPurchase.Input.Body.jsonPayload.packLinesPayloadPayload

    fileprivate var generated: Generated {
        .init(packId: packId, qty: qty, totalCostCents: totalCostCents)
    }
}
