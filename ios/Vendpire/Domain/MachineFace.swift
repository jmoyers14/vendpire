import Foundation

/// What a cell knows about itself once the planogram and product are joined on.
struct FaceCell: Equatable, Sendable {
    let slotCode: String
    let state: FaceCellState
    let productName: String?
    let par: Int?
    let priceCents: Int?
}

/// `unknownProduct` is not `empty`. The slot IS planogrammed, so par and price
/// are real and only the name failed to resolve — rendering it blank would hide
/// a dangling reference instead of showing one.
enum FaceCellState: Equatable, Sendable {
    case assigned
    case empty
    case unknownProduct
}

/// The machine face as rows of resolved cells: `slot → planogram → product`.
///
/// `rows` is `slots` walked verbatim. Nothing sorts, nothing parses a code and
/// nothing derives a width — real machines mix `A0 A2 A4 A6` with `D1…D7` on
/// shelves of differing widths, so the authored layout is the only truth.
struct MachineFace {
    let rows: [[FaceCell]]

    init(slots: [[String]], planogramSlots: [PlanogramSlot], productNames: [String: String]) {
        // Uniquing rather than `uniqueKeysWithValues`: a planogram that somehow
        // repeats a slot code should render, not trap.
        let bySlotCode = Dictionary(planogramSlots.map { ($0.slotCode, $0) }) { first, _ in first }

        rows = slots.map { shelf in
            shelf.map { slotCode in
                Self.resolve(
                    slotCode: slotCode,
                    planogramSlot: bySlotCode[slotCode],
                    productNames: productNames
                )
            }
        }
    }

    private static func resolve(
        slotCode: String,
        planogramSlot: PlanogramSlot?,
        productNames: [String: String]
    ) -> FaceCell {
        guard let planogramSlot else {
            return FaceCell(
                slotCode: slotCode,
                state: .empty,
                productName: nil,
                par: nil,
                priceCents: nil
            )
        }
        guard let productName = productNames[planogramSlot.productId] else {
            return FaceCell(
                slotCode: slotCode,
                state: .unknownProduct,
                productName: nil,
                par: planogramSlot.par,
                priceCents: planogramSlot.priceCents
            )
        }
        return FaceCell(
            slotCode: slotCode,
            state: .assigned,
            productName: productName,
            par: planogramSlot.par,
            priceCents: planogramSlot.priceCents
        )
    }
}
