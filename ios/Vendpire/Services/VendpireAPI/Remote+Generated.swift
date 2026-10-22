import Foundation

/// Generated OpenAPI types in, `Remote*` out. The only file in the app that
/// knows the generated types exist.
///
/// This is where a spec change becomes a compile error. The cost of the extra
/// hop is that stubs stay two lines and the bundled fixture is still valid test
/// input.
///
/// Dates arrive already decoded: the generator's transcoder handles the
/// `format: date-time` fields, so `RemoteOrg.makeDecoder()` is not involved.

extension RemoteIdentity {
    init(_ generated: Components.Schemas.Identity) {
        self.init(userId: generated.userId, orgId: generated.orgId)
    }
}

extension RemoteLocation {
    init(_ generated: Components.Schemas.Location) {
        self.init(
            id: generated.id,
            name: generated.name,
            address: PostalAddress(generated.address),
            contact: ContactInfo(generated.contact),
            commission: Commission(generated.commission),
            notes: generated.notes,
            active: generated.active,
            // Not on the REST surface at all — the Remote struct declares it
            // optional for the local SwiftData model's sake, not the wire shape.
            deletedAt: nil,
            updatedAt: generated.updatedAt
        )
    }
}

extension PostalAddress {
    init(_ generated: Components.Schemas.Location.addressPayload) {
        self.init(
            line1: generated.line1,
            city: generated.city,
            state: generated.state,
            zip: generated.zip,
            geo: generated.geo.map { GeoPoint(lat: $0.lat, lng: $0.lng) }
        )
    }
}

extension ContactInfo {
    init(_ generated: Components.Schemas.Location.contactPayload) {
        self.init(name: generated.name, phone: generated.phone, email: generated.email)
    }
}

extension Commission {
    /// Flattens the document's one `oneOf` into the stored struct. `type` stays
    /// a raw String, but that buys nothing today: the generated `oneOf` is
    /// closed, so a fourth arm from a newer server fails the decode — and a
    /// failed decode fails the whole refresh, not just this location.
    init(_ generated: Components.Schemas.LocationCommission) {
        switch generated {
        case .case1:
            self.init(type: "none", percentBps: nil, flatCents: nil, basis: nil)
        case .case2(let percent):
            self.init(
                type: "percent",
                percentBps: percent.percentBps,
                flatCents: nil,
                basis: percent.basis.rawValue
            )
        case .case3(let flat):
            self.init(type: "flat", percentBps: nil, flatCents: flat.flatCents, basis: nil)
        }
    }
}

extension RemoteMachine {
    init(_ generated: Components.Schemas.Machine) {
        self.init(
            id: generated.id,
            locationId: generated.locationId,
            name: generated.name,
            // A raw String here, but the generated enum feeding it is closed:
            // an unrecognised kind fails the decode, and that fails the whole
            // refresh, so there is no surviving machine for this to loosen.
            kind: generated.kind.rawValue,
            make: generated.make,
            model: generated.model,
            serial: generated.serial,
            tagCode: generated.tagCode,
            slots: generated.slots,
            cardReader: generated.cardReader.map {
                CardReader(provider: $0.provider.rawValue, deviceId: $0.deviceId)
            },
            active: generated.active,
            deletedAt: nil,
            updatedAt: generated.updatedAt
        )
    }
}

extension RemoteProduct {
    init(_ generated: Components.Schemas.Product) {
        self.init(
            id: generated.id,
            name: generated.name,
            upc: generated.upc,
            category: generated.category,
            taxClass: generated.taxClass,
            imageUrl: generated.imageUrl,
            defaultPriceCents: generated.defaultPriceCents,
            active: generated.active,
            // tracksExpiration is on the generated Product but not on
            // RemoteProduct — deliberately unmapped, not an oversight.
            deletedAt: nil,
            updatedAt: generated.updatedAt
        )
    }
}

extension RemotePack {
    init(_ generated: Components.Schemas.Pack) {
        self.init(
            id: generated.id,
            name: generated.name,
            barcodes: generated.barcodes,
            contents: generated.contents.map {
                PackContent(productId: $0.productId, units: $0.units)
            },
            active: generated.active,
            deletedAt: nil,
            updatedAt: generated.updatedAt
        )
    }
}

extension RemotePlanogram {
    init(_ generated: Components.Schemas.Planogram) {
        self.init(
            id: generated.id,
            machineId: generated.machineId,
            effectiveFrom: generated.effectiveFrom,
            slots: generated.slots.map {
                PlanogramSlot(
                    slotCode: $0.slotCode,
                    productId: $0.productId,
                    par: $0.par,
                    priceCents: $0.priceCents
                )
            },
            deletedAt: nil,
            updatedAt: generated.updatedAt
        )
    }
}

extension RemoteVisit {
    init(_ generated: Components.Schemas.Visit) {
        self.init(
            id: generated.id,
            machineId: generated.machineId,
            countedAt: generated.countedAt,
            lines: generated.lines.map {
                RemoteVisitLine(
                    slotCode: $0.slotCode,
                    productId: $0.productId,
                    remaining: $0.remaining,
                    added: $0.added,
                    removed: $0.removed
                )
            }
        )
    }
}
