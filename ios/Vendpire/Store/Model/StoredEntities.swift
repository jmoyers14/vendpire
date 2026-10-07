import Foundation
import SwiftData

/// The device's mirror of the org's reference data.
///
/// Five entities, all already shipped and stable server-side. The visit model is
/// deliberately absent — it depends on Phase 3 and nothing speculative is built
/// here.
///
/// Three rules run through all of them:
///
/// - **`id` is the server's id**, marked `.unique` so a re-sync upserts rather
///   than duplicates.
/// - **No `orgId` field.** The store holds exactly one org, named by
///   `StoreMetadata`. A leak across orgs has no field to travel through.
///   See ARCHITECTURE.md.
/// - **Money is `Int` cents.** Never `Double`, never `Decimal`.
///
/// `deletedAt` is carried rather than filtered on import: a soft-deleted product
/// still has to resolve when an older visit references it.

@Model
final class StoredLocation {
    #Unique<StoredLocation>([\.id])

    var id: String = ""
    var name: String = ""
    var address: PostalAddress?
    var contact: ContactInfo?
    var commission: Commission?
    var notes: String?
    var active: Bool = true
    var deletedAt: Date?
    var updatedAt: Date?

    init(
        id: String,
        name: String,
        address: PostalAddress? = nil,
        contact: ContactInfo? = nil,
        commission: Commission? = nil,
        notes: String? = nil,
        active: Bool = true,
        deletedAt: Date? = nil,
        updatedAt: Date? = nil
    ) {
        self.id = id
        self.name = name
        self.address = address
        self.contact = contact
        self.commission = commission
        self.notes = notes
        self.active = active
        self.deletedAt = deletedAt
        self.updatedAt = updatedAt
    }
}

@Model
final class StoredMachine {
    #Unique<StoredMachine>([\.id])

    var id: String = ""
    /// Where it sits *now*. Each visit records its own locationId, so moving a
    /// machine never rewrites history.
    var locationId: String = ""
    var name: String = ""
    /// Raw string, not an enum: an unfamiliar kind from a newer server must not
    /// stop the machine from rendering.
    var kind: String = ""
    var make: String?
    var model: String?
    var serial: String?
    /// What the QR/NFC sticker encodes. Unused in v1 — the plan selects machines
    /// by location, not by scan.
    var tagCode: String?

    /// The machine face: one array per shelf, slot codes in walking order.
    ///
    /// **Stored and rendered exactly as authored.** Layout is never inferred
    /// from the codes themselves — real machines use `A0 A2 A4 A6`, bare letters
    /// `A B C D E F`, and shelves of differing widths. This is the single most
    /// important field in the model.
    var slots: [[String]] = []

    var cardReader: CardReader?
    var active: Bool = true
    var deletedAt: Date?
    var updatedAt: Date?

    enum Kind: String { case snack, drink, combo }
    var machineKind: Kind? { Kind(rawValue: kind) }

    init(
        id: String,
        locationId: String,
        name: String,
        kind: String,
        make: String? = nil,
        model: String? = nil,
        serial: String? = nil,
        tagCode: String? = nil,
        slots: [[String]] = [],
        cardReader: CardReader? = nil,
        active: Bool = true,
        deletedAt: Date? = nil,
        updatedAt: Date? = nil
    ) {
        self.id = id
        self.locationId = locationId
        self.name = name
        self.kind = kind
        self.make = make
        self.model = model
        self.serial = serial
        self.tagCode = tagCode
        self.slots = slots
        self.cardReader = cardReader
        self.active = active
        self.deletedAt = deletedAt
        self.updatedAt = updatedAt
    }
}

@Model
final class StoredProduct {
    #Unique<StoredProduct>([\.id])

    var id: String = ""
    var name: String = ""
    /// The UNIT barcode on the can or bag, normalized to GTIN-14. Null until
    /// verified. Unit cost is deliberately NOT here — it is derived from
    /// purchases, so a late receipt corrects history.
    var upc: String?
    var category: String = ""
    /// Feeds California's vending tax rules (CDTFA pub. 118) in reports.
    var taxClass: String?
    var imageUrl: String?
    var defaultPriceCents: Int = 0
    var active: Bool = true
    var deletedAt: Date?
    var updatedAt: Date?

    init(
        id: String,
        name: String,
        upc: String? = nil,
        category: String,
        taxClass: String? = nil,
        imageUrl: String? = nil,
        defaultPriceCents: Int,
        active: Bool = true,
        deletedAt: Date? = nil,
        updatedAt: Date? = nil
    ) {
        self.id = id
        self.name = name
        self.upc = upc
        self.category = category
        self.taxClass = taxClass
        self.imageUrl = imageUrl
        self.defaultPriceCents = defaultPriceCents
        self.active = active
        self.deletedAt = deletedAt
        self.updatedAt = updatedAt
    }
}

/// A way of BUYING products, never of selling them — "Kirkland Coke 35pk".
@Model
final class StoredPack {
    #Unique<StoredPack>([\.id])

    var id: String = ""
    var name: String = ""
    /// Case-level barcodes, normalized to GTIN-14. One pack can carry several
    /// because packaging gets refreshed.
    var barcodes: [String] = []
    var contents: [PackContent] = []
    var active: Bool = true
    var deletedAt: Date?
    var updatedAt: Date?

    init(
        id: String,
        name: String,
        barcodes: [String] = [],
        contents: [PackContent] = [],
        active: Bool = true,
        deletedAt: Date? = nil,
        updatedAt: Date? = nil
    ) {
        self.id = id
        self.name = name
        self.barcodes = barcodes
        self.contents = contents
        self.active = active
        self.deletedAt = deletedAt
        self.updatedAt = updatedAt
    }
}

/// One VERSION of a machine's layout. Planograms are immutable — a change
/// creates a new document with a later `effectiveFrom`, so past visits keep the
/// par and price they were filled against. The current one is simply the latest.
@Model
final class StoredPlanogram {
    #Unique<StoredPlanogram>([\.id])

    var id: String = ""
    var machineId: String = ""
    var effectiveFrom: Date = Date.distantPast
    var slots: [PlanogramSlot] = []
    var deletedAt: Date?
    var updatedAt: Date?

    init(
        id: String,
        machineId: String,
        effectiveFrom: Date,
        slots: [PlanogramSlot] = [],
        deletedAt: Date? = nil,
        updatedAt: Date? = nil
    ) {
        self.id = id
        self.machineId = machineId
        self.effectiveFrom = effectiveFrom
        self.slots = slots
        self.deletedAt = deletedAt
        self.updatedAt = updatedAt
    }
}

/// Which organization this store currently mirrors, and when it last filled.
///
/// Exactly one row. If the signed-in org differs from `orgId`, the store is
/// wiped and reseeded — which is what makes cross-org leakage impossible rather
/// than merely unlikely, since no entity carries an org and no query filters by
/// one.
@Model
final class StoreMetadata {
    var orgId: String = ""
    var lastSyncedAt: Date?

    init(orgId: String, lastSyncedAt: Date? = nil) {
        self.orgId = orgId
        self.lastSyncedAt = lastSyncedAt
    }
}
