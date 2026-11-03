import Foundation

/// One line of the purchase being entered — loose units of a product, or N of
/// a pack. The web's `Row` union flattened into one struct with a `kind`,
/// because `ForEach` wants a single `Identifiable` element type.
///
/// Counts and costs are text because they back text fields; they become numbers
/// only at save, where a half-typed one is rejected by line number.
nonisolated struct PurchaseRow: Equatable, Identifiable, Sendable {
    enum Kind: Equatable, Sendable {
        case unit
        case pack
        /// A case committed to, but not yet created — nothing to resolve to
        /// a mirror record until its contents are done. `PurchaseLogModel`
        /// resolves it into a real `.pack` row once `createPack` succeeds.
        case packDraft
    }

    let id: UUID
    let kind: Kind
    /// A `StoredProduct.id` for `.unit`, a `StoredPack.id` for `.pack`, the
    /// draft's own id for `.packDraft` — the key into
    /// `PurchaseLogModel.packDrafts`.
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

    var isPack: Bool { kind == .pack || kind == .packDraft }
}

/// A case row's contents at a glance: "35 units", and "$0.54 / unit" when the
/// case holds one product and its cost is typed.
nonisolated struct CaseSummary: Equatable, Sendable {
    let unitsPerCase: Int
    let unitCostCents: Int?
}
