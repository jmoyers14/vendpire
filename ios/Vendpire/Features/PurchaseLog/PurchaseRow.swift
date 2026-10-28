import Foundation

/// One line of the purchase being entered — either loose units of a product or
/// N of a pack, whichever the scanned code turned out to be. The web's `Row`
/// union, flattened: one struct with a `kind`, because SwiftUI's `ForEach`
/// wants a single `Identifiable` element type.
///
/// Counts and costs are text because they back text fields. They become numbers
/// only at save, where a half-typed one is rejected by line number rather than
/// quietly coerced to zero.
nonisolated struct PurchaseRow: Equatable, Identifiable, Sendable {
    enum Kind: Equatable, Sendable {
        case unit
        case pack
    }

    let id: UUID
    let kind: Kind
    /// A `StoredProduct.id` for `.unit`, a `StoredPack.id` for `.pack`.
    let recordId: String
    /// Denormalized when the row was added, so rendering a row never goes back
    /// to the mirror — and a record renamed mid-entry keeps the name the
    /// operator saw when they scanned it.
    let name: String
    /// Units for a `.unit` row, cases for a `.pack` row.
    var quantityText: String
    var totalCostText: String

    /// A scanned or picked line starts at one of whatever it is, with the cost
    /// still to be read off the receipt.
    init(
        id: UUID = UUID(),
        kind: Kind,
        recordId: String,
        name: String,
        quantityText: String = "1",
        totalCostText: String = ""
    ) {
        self.id = id
        self.kind = kind
        self.recordId = recordId
        self.name = name
        self.quantityText = quantityText
        self.totalCostText = totalCostText
    }

    var isPack: Bool { kind == .pack }
}
