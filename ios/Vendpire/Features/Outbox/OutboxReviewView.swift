import SwiftData
import SwiftUI

/// Work that has not reached the server yet, and work only a person can fix.
///
/// Two sections on purpose: pending rows are a timer's problem and resolve on
/// their own; needsAttention rows carry the server's own words and a Retry,
/// because the drain will never touch them again without one.
struct OutboxReviewView: View {
    @Environment(OutboxSubmitter.self) private var submitter

    // Unsorted on purpose: OutboxReviewRow.rows owns the ordering, and the
    // tests pin it there. Two sorts would leave a reader checking which one
    // is load-bearing.
    @Query private var items: [OutboxItem]
    @Query private var drafts: [VisitDraft]
    @Query private var machines: [StoredMachine]

    private var rows: [OutboxReviewRow] {
        OutboxReviewRow.rows(
            items: items,
            drafts: drafts,
            machineNames: Dictionary(machines.map { ($0.id, $0.name) }) { first, _ in first }
        )
    }

    var body: some View {
        // Computed once: the join sorts and builds dictionaries, and body
        // would otherwise run it three times per pass.
        let rows = rows

        return Group {
            if rows.isEmpty {
                ContentUnavailableView(
                    "Everything has synced",
                    systemImage: "checkmark.circle",
                    description: Text("Visits you submit appear here until they reach the server.")
                )
            } else {
                list(rows)
            }
        }
        .navigationTitle("Waiting to sync")
        .navigationBarTitleDisplayMode(.inline)
    }

    private func list(_ rows: [OutboxReviewRow]) -> some View {
        let stuck = rows.filter(\.needsAttention)
        let pending = rows.filter { !$0.needsAttention }

        return List {
            if !stuck.isEmpty {
                Section {
                    ForEach(stuck) { row in
                        VStack(alignment: .leading, spacing: 4) {
                            rowHeader(row)
                            // The server's words, verbatim — paraphrasing an
                            // error is how it stops matching what the web shows.
                            Text(row.detail)
                                .font(.callout)
                                .foregroundStyle(Color.primary)
                            Button("Retry") {
                                retry(row)
                            }
                            .font(.callout.weight(.medium))
                        }
                        .padding(.vertical, 2)
                    }
                } header: {
                    Text("Needs attention")
                } footer: {
                    Text("These won't retry on their own. Fix the cause, then retry.")
                }
            }

            if !pending.isEmpty {
                Section("Waiting") {
                    ForEach(pending) { row in
                        VStack(alignment: .leading, spacing: 2) {
                            rowHeader(row)
                            Text(row.detail)
                                .font(.caption)
                                .foregroundStyle(Color.secondary)
                        }
                    }
                }
            }
        }
    }

    private func rowHeader(_ row: OutboxReviewRow) -> some View {
        HStack(alignment: .firstTextBaseline) {
            Text(row.title)
            Spacer()
            Text(row.countedAt.formatted(date: .abbreviated, time: .shortened))
                .font(.caption)
                .foregroundStyle(Color.secondary)
        }
    }

    private func retry(_ row: OutboxReviewRow) {
        guard let item = items.first(where: { $0.id == row.id }) else { return }

        Task { await submitter.retry(item) }
    }
}
