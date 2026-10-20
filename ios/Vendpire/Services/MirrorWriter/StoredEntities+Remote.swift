import Foundation

/// Builds each stored model from its remote twin, and refreshes it in place.
///
/// Kept out of `Store/Model/` so the storage layer stays ignorant of the wire.
/// The tradeoff: a field added to `Stored*` and not assigned here is silently
/// never filled — diff the two files whenever the schema changes.
///
/// `deletedAt` is copied rather than filtered: a soft-deleted product still has
/// to resolve when an older visit references it.

extension StoredLocation {
    convenience init(_ remote: RemoteLocation) {
        self.init(id: remote.id, name: remote.name)
        update(from: remote)
    }

    func update(from remote: RemoteLocation) {
        name = remote.name
        address = remote.address
        contact = remote.contact
        commission = remote.commission
        notes = remote.notes
        active = remote.active
        deletedAt = remote.deletedAt
        updatedAt = remote.updatedAt
    }
}

extension StoredMachine {
    convenience init(_ remote: RemoteMachine) {
        self.init(
            id: remote.id,
            locationId: remote.locationId,
            name: remote.name,
            kind: remote.kind
        )
        update(from: remote)
    }

    func update(from remote: RemoteMachine) {
        locationId = remote.locationId
        name = remote.name
        kind = remote.kind
        make = remote.make
        model = remote.model
        serial = remote.serial
        tagCode = remote.tagCode
        slots = remote.slots
        cardReader = remote.cardReader
        active = remote.active
        deletedAt = remote.deletedAt
        updatedAt = remote.updatedAt
    }
}

extension StoredProduct {
    convenience init(_ remote: RemoteProduct) {
        self.init(
            id: remote.id,
            name: remote.name,
            category: remote.category,
            defaultPriceCents: remote.defaultPriceCents
        )
        update(from: remote)
    }

    func update(from remote: RemoteProduct) {
        name = remote.name
        upc = remote.upc
        category = remote.category
        taxClass = remote.taxClass
        imageUrl = remote.imageUrl
        defaultPriceCents = remote.defaultPriceCents
        active = remote.active
        deletedAt = remote.deletedAt
        updatedAt = remote.updatedAt
    }
}

extension StoredPack {
    convenience init(_ remote: RemotePack) {
        self.init(id: remote.id, name: remote.name)
        update(from: remote)
    }

    func update(from remote: RemotePack) {
        name = remote.name
        barcodes = remote.barcodes
        contents = remote.contents
        active = remote.active
        deletedAt = remote.deletedAt
        updatedAt = remote.updatedAt
    }
}

extension StoredPlanogram {
    convenience init(_ remote: RemotePlanogram) {
        self.init(
            id: remote.id,
            machineId: remote.machineId,
            effectiveFrom: remote.effectiveFrom
        )
        update(from: remote)
    }

    func update(from remote: RemotePlanogram) {
        machineId = remote.machineId
        effectiveFrom = remote.effectiveFrom
        slots = remote.slots
        deletedAt = remote.deletedAt
        updatedAt = remote.updatedAt
    }
}
