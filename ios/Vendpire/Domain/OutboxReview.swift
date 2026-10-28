import Foundation

/// One row of the outbox screen — the operator's only view of work that has
/// not reached the server.
///
/// The queue row is opaque by design, so the machine's name comes from the
/// draft that survives beside it until the drain confirms the visit. A row
/// that cannot resolve a name still says what it is: blanking it would hide
/// exactly the thing this screen exists to show.
nonisolated struct OutboxReviewRow: Equatable, Sendable, Identifiable {
    let id: String
    let title: String
    let countedAt: Date
    /// Where the row is in the retry loop, or the server's own words when only
    /// a person can fix it.
    let detail: String
    let needsAttention: Bool

    /// Oldest observation first — the same order the drain sends in, so the
    /// list reads as the queue it is.
    static func rows(
        items: [OutboxItem],
        drafts: [VisitDraft],
        machineNames: [String: String]
    ) -> [OutboxReviewRow] {
        let machineIdByRequest = Dictionary(
            drafts.map { ($0.clientRequestId, $0.machineId) }
        ) { first, _ in first }

        return items
            .sorted { $0.countedAt < $1.countedAt }
            .map { item in
                OutboxReviewRow(
                    id: item.id,
                    title: title(for: item, machineIdByRequest: machineIdByRequest, machineNames: machineNames),
                    countedAt: item.countedAt,
                    detail: detail(for: item),
                    needsAttention: item.status == "needsAttention"
                )
            }
    }

    private static func title(
        for item: OutboxItem,
        machineIdByRequest: [String: String],
        machineNames: [String: String]
    ) -> String {
        if let machineId = machineIdByRequest[item.id], let name = machineNames[machineId] {
            return name
        }
        return item.kind.capitalized
    }

    private static func detail(for item: OutboxItem) -> String {
        if item.status == "needsAttention" {
            return item.lastMessage ?? "The server rejected this and gave no reason."
        }
        switch item.attemptCount {
        case 0: return "waiting to sync"
        case 1: return "1 attempt so far"
        default: return "\(item.attemptCount) attempts so far"
        }
    }
}
