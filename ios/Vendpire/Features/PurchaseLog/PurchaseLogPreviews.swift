#if DEBUG
import SwiftData
import SwiftUI

/// Sample purchases for Xcode's canvas: an in-memory store with a few
/// products and cases, and an API that is always offline so the screen's
/// refresh fails fast instead of reaching for Clerk.
@MainActor
private enum PurchasePreviewData {
    static func makeContainer() -> ModelContainer {
        let container = try! VendpireStore.makeInMemoryContainer()
        let context = container.mainContext
        context.insert(StoredProduct(id: "p-coke", name: "Coke Zero", category: "drinks", defaultPriceCents: 175))
        context.insert(StoredProduct(id: "p-doritos", name: "Doritos Nacho Cheese", category: "snacks", defaultPriceCents: 150))
        context.insert(cokeCase)
        context.insert(varietyCase)
        return container
    }

    static let cokeCase = StoredPack(
        id: "k-coke", name: "Coke Zero 35pk",
        contents: [PackContent(productId: "p-coke", units: 35)]
    )

    static let varietyCase = StoredPack(
        id: "k-variety", name: "Costco variety case",
        contents: [
            PackContent(productId: "p-coke", units: 20),
            PackContent(productId: "p-doritos", units: 10),
        ]
    )

    static func makeModel(isFilled: Bool) -> PurchaseLogModel {
        let model = PurchaseLogModel()
        model.vendor = "Costco"
        guard isFilled else { return model }

        addRow(to: model, CatalogItem(kind: .unit(imageUrl: nil), recordId: "p-doritos", name: "Doritos Nacho Cheese", barcode: nil), quantity: "6", cost: "9.00")
        addRow(to: model, CatalogItem(kind: .pack(units: 35), recordId: cokeCase.id, name: cokeCase.name, barcode: nil), quantity: "1", cost: "18.99")
        addRow(to: model, CatalogItem(kind: .pack(units: 30), recordId: varietyCase.id, name: varietyCase.name, barcode: nil), quantity: "2", cost: "37.98")
        model.receiptTotalText = "70.00"
        return model
    }

    private static func addRow(to model: PurchaseLogModel, _ item: CatalogItem, quantity: String, cost: String) {
        model.add(item)
        model.setPendingLineCost(LineCost(mode: .total, quantityText: quantity, amountText: cost))
        model.commitPendingLine()
    }
}

/// Every call fails the way a phone with no signal does.
private struct OfflineVendpireAPI: VendpireAPI {
    private var offline: URLError { URLError(.notConnectedToInternet) }

    func fetchIdentity() async throws -> RemoteIdentity { throw offline }
    func fetchLocations() async throws -> [RemoteLocation] { throw offline }
    func fetchMachines() async throws -> [RemoteMachine] { throw offline }
    func fetchProducts() async throws -> [RemoteProduct] { throw offline }
    func fetchPacks() async throws -> [RemotePack] { throw offline }
    func fetchCurrentPlanograms() async throws -> [RemotePlanogram] { throw offline }
    func fetchLatestVisits() async throws -> [RemoteVisit] { throw offline }
    func fetchBarcodeCandidate(code: String) async throws -> RemoteCandidate? { throw offline }
    func createProduct(_ draft: RemoteProductDraft) async throws -> RemoteProduct { throw offline }
    func createPack(_ draft: RemotePackDraft) async throws -> RemotePack { throw offline }
    func attachProductBarcode(productId: String, code: String) async throws -> RemoteProduct { throw offline }
    func attachPackBarcode(packId: String, code: String) async throws -> RemotePack { throw offline }
}

private struct PurchasePreview<Content: View>: View {
    let container = PurchasePreviewData.makeContainer()
    @ViewBuilder let content: () -> Content

    var body: some View {
        NavigationStack {
            content()
        }
        .environment(MirrorRefresher(api: OfflineVendpireAPI(), writer: MirrorWriter(context: container.mainContext)))
        .modelContainer(container)
    }
}

#Preview("Filled") {
    PurchasePreview {
        PurchaseLogView(model: PurchasePreviewData.makeModel(isFilled: true))
    }
}

#Preview("Empty") {
    PurchasePreview {
        PurchaseLogView(model: PurchasePreviewData.makeModel(isFilled: false))
    }
}

#Preview("Entry") {
    let model = PurchasePreviewData.makeModel(isFilled: true)
    let _ = model.add(CatalogItem(kind: .pack(units: 35), recordId: "k-coke", name: "Coke Zero 35pk", barcode: nil))
    let _ = model.setPendingLineCost(LineCost(mode: .each, quantityText: "2", amountText: "18.99"))
    PurchasePreview {
        PurchaseLineSheet(model: model, start: .search)
    }
}

#Preview("Case details") {
    let model = PurchasePreviewData.makeModel(isFilled: true)
    PurchasePreview {
        CaseDetailsView(model: model, rowId: model.rows[2].id)
    }
}
#endif
