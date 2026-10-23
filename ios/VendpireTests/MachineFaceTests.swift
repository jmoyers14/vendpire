import XCTest

@testable import Vendpire

/// The `slot → planogram → product` join. Pure values in, pure values out —
/// no container, no simulator, no fixture.
///
/// The rule under test throughout: layout is never inferred from slot codes.
/// `National 148` is the proof case because its shelves are ragged AND its
/// codes change convention partway down, so anything that parses a code to
/// derive a grid gets both the shape and the ordering wrong.
final class MachineFaceTests: XCTestCase {
    /// `National 148`: widths [4,4,4,7,7,4], stepping by two on A–C and F,
    /// by one on D–E.
    private let national148: [[String]] = [
        ["A0", "A2", "A4", "A6"],
        ["B0", "B2", "B4", "B6"],
        ["C0", "C2", "C4", "C6"],
        ["D1", "D2", "D3", "D4", "D5", "D6", "D7"],
        ["E1", "E2", "E3", "E4", "E5", "E6", "E7"],
        ["F0", "F2", "F4", "F6"],
    ]

    private func slot(
        _ slotCode: String,
        _ productId: String,
        par: Int = 10,
        priceCents: Int = 175
    ) -> PlanogramSlot {
        PlanogramSlot(slotCode: slotCode, productId: productId, par: par, priceCents: priceCents)
    }

    func testRaggedShelvesKeepTheirAuthoredWidths() {
        let face = MachineFace(slots: national148, planogramSlots: [], productNames: [:])

        XCTAssertEqual(face.rows.map(\.count), [4, 4, 4, 7, 7, 4])
    }

    func testCellsStayInAuthoredOrderWhateverOrderThePlanogramArrivesIn() {
        let shuffled = [
            slot("A6", "p-6"),
            slot("A2", "p-2"),
            slot("A0", "p-0"),
            slot("A4", "p-4"),
        ]

        let face = MachineFace(
            slots: [["A0", "A2", "A4", "A6"]],
            planogramSlots: shuffled,
            productNames: ["p-0": "Celsius", "p-2": "Sprite", "p-4": "Twix", "p-6": "Chex Mix"]
        )

        XCTAssertEqual(face.rows[0].map(\.slotCode), ["A0", "A2", "A4", "A6"])
        XCTAssertEqual(face.rows[0].map(\.productName), ["Celsius", "Sprite", "Twix", "Chex Mix"])
    }

    func testASlotWithNoPlanogramEntryIsEmptyWithoutShiftingItsRow() {
        let face = MachineFace(
            slots: [["A0", "A2", "A4", "A6"]],
            planogramSlots: [slot("A0", "p-0"), slot("A4", "p-4")],
            productNames: ["p-0": "Celsius", "p-4": "Twix"]
        )

        XCTAssertEqual(face.rows[0].count, 4)
        XCTAssertEqual(face.rows[0].map(\.state), [.assigned, .empty, .assigned, .empty])
        XCTAssertEqual(face.rows[0][1].slotCode, "A2")
        XCTAssertNil(face.rows[0][1].productName)
        XCTAssertNil(face.rows[0][1].par)
        XCTAssertNil(face.rows[0][1].priceCents)
    }

    func testADanglingProductIdKeepsParAndPriceRatherThanGoingBlank() {
        let face = MachineFace(
            slots: [["A0"]],
            planogramSlots: [slot("A0", "deleted-product", par: 8, priceCents: 325)],
            productNames: [:]
        )

        let cell = face.rows[0][0]
        XCTAssertEqual(cell.state, .unknownProduct)
        XCTAssertNil(cell.productName)
        XCTAssertEqual(cell.par, 8)
        XCTAssertEqual(cell.priceCents, 325)
    }

    func testAMachineWithNoPlanogramRendersEveryCellEmpty() {
        let face = MachineFace(slots: national148, planogramSlots: [], productNames: [:])

        XCTAssertEqual(face.rows.flatMap { $0 }.count, 30)
        XCTAssertTrue(face.rows.flatMap { $0 }.allSatisfy { $0.state == .empty })
    }

    func testDuplicateSlotCodesOnDifferentShelvesBothResolve() {
        let face = MachineFace(
            slots: [["A1"], ["A1"]],
            planogramSlots: [slot("A1", "p-1", par: 6, priceCents: 150)],
            productNames: ["p-1": "Snickers"]
        )

        XCTAssertEqual(face.rows.map(\.count), [1, 1])
        XCTAssertEqual(face.rows[0][0], face.rows[1][0])
        XCTAssertEqual(face.rows[1][0].productName, "Snickers")
    }

    func testTheUniformControlMachineJoinsTheSameWay() {
        let face = MachineFace(
            slots: [["A1", "A2"], ["B1", "B2"]],
            planogramSlots: [
                slot("A1", "p-a1", par: 10, priceCents: 500),
                slot("A2", "p-a2", par: 10, priceCents: 325),
                slot("B1", "p-b1", par: 10, priceCents: 200),
                slot("B2", "p-b2", par: 10, priceCents: 400),
            ],
            productNames: ["p-a1": "Celsius", "p-a2": "Sprite", "p-b1": "Twix", "p-b2": "Red Bull"]
        )

        XCTAssertEqual(face.rows.map(\.count), [2, 2])
        XCTAssertTrue(face.rows.flatMap { $0 }.allSatisfy { $0.state == .assigned })
        XCTAssertEqual(face.rows[1][1].priceCents, 400)
    }
}
