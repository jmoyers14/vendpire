import Foundation

/// Largest-remainder money split, ported from packages/domain/src/money/allocate.ts
/// and pinned to the same vectors. Display preview ONLY — the server's
/// expandPackLines stays authoritative for what gets stored.
nonisolated enum Allocate {
    /// Parts always sum EXACTLY to totalCents: leftover pennies go to the
    /// largest fractional shares first (ties keep input order, as in TS).
    static func proportionally(totalCents: Int, weights: [Int]) -> [Int] {
        let totalWeight = weights.reduce(0, +)
        guard totalWeight > 0 else { return weights.map { _ in 0 } }

        let exact = weights.map { Double(totalCents * $0) / Double(totalWeight) }
        var result = exact.map { Int($0.rounded(.down)) }
        var remainder = totalCents - result.reduce(0, +)

        let order = exact.enumerated()
            .map { (index: $0.offset, frac: $0.element - $0.element.rounded(.down)) }
            .sorted { $0.frac > $1.frac }   // Swift sort is stable since 5.x
        for entry in order where remainder > 0 {
            result[entry.index] += 1
            remainder -= 1
        }
        return result
    }
}
