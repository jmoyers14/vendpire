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

    /// The row as a line total, for the each-price hint.
    var cost: LineCost {
        LineCost(mode: .total, quantityText: quantityText, amountText: totalCostText)
    }
}

/// A receipt line's quantity and cost as typed. Receipts print either a line
/// total or an each price depending on the store, so the cost is typed either
/// way — and the row it becomes always holds the total.
nonisolated struct LineCost: Equatable, Sendable {
    enum Mode: Equatable, Sendable {
        case total
        case each
    }

    var mode: Mode
    var quantityText: String
    var amountText: String

    init(mode: Mode, quantityText: String = "1", amountText: String = "") {
        self.mode = mode
        self.quantityText = quantityText
        self.amountText = amountText
    }

    var quantity: Int? {
        guard let quantity = Int(quantityText.trimmed), quantity >= 1 else { return nil }
        return quantity
    }

    /// Each × qty in Each mode, so a total built from an each price is exact.
    var lineTotalCents: Int? {
        guard let quantity, let amountCents = Money.parseDollarsToCents(amountText) else { return nil }
        return mode == .total ? amountCents : amountCents * quantity
    }

    var isComplete: Bool { lineTotalCents != nil }

    /// The number not typed, to check against the receipt: each from a total,
    /// total from an each. Display only — nil at qty 1, where they're the same.
    var counterpartCents: Int? {
        guard let quantity, quantity > 1,
              let amountCents = Money.parseDollarsToCents(amountText)
        else { return nil }

        switch mode {
        case .total: return Int((Double(amountCents) / Double(quantity)).rounded())
        case .each: return amountCents * quantity
        }
    }
}

/// One receipt line on the Entry screen, before it becomes a row.
nonisolated struct LineEntry: Equatable, Sendable {
    let item: CatalogItem
    var cost: LineCost

    func makeRow() -> PurchaseRow {
        PurchaseRow(
            kind: item.isPack ? .pack : .unit,
            recordId: item.recordId,
            name: item.name,
            quantityText: cost.quantity.map(String.init) ?? cost.quantityText,
            totalCostText: cost.lineTotalCents.map(Money.formatCentsForEditing) ?? ""
        )
    }
}

/// A case being created from a scan: its name and receipt line, typed before
/// its contents, so the line is ready the moment `createPack` reports it.
nonisolated struct NewCaseDraft: Equatable, Sendable {
    var name: String
    var cost: LineCost

    var isReadyForContents: Bool { !name.trimmed.isEmpty && cost.isComplete }
}

/// A case row's contents at a glance: "35 units", and "$0.54 / unit" when the
/// case holds one product and its cost is typed.
nonisolated struct CaseSummary: Equatable, Sendable {
    let unitsPerCase: Int
    let unitCostCents: Int?

    var unitCostText: String? {
        unitCostCents.map { "\(Money.formatCents($0)) / unit" }
    }
}

/// One product inside a case, as case details lists it.
nonisolated struct CaseContent: Equatable, Sendable {
    let name: String
    let unitsPerCase: Int
}

/// Every text field on the purchase screen, for the keyboard's up/down arrows.
nonisolated enum PurchaseField: Hashable, Sendable {
    case quantity(rowId: UUID)
    case totalCost(rowId: UUID)

    var rowId: UUID {
        switch self {
        case .quantity(let rowId), .totalCost(let rowId): rowId
        }
    }
}

/// The footer's verdict on the entered lines against the receipt total.
nonisolated enum ReceiptStatus: Equatable, Sendable {
    case matches
    /// The receipt says more was spent than the lines account for.
    case unaccounted(cents: Int)
    /// The lines add up to more than the receipt.
    case overReceipt(cents: Int)
}
