import { injectable } from "tsyringe";
import { LocationModel } from "../../models/Location.ts";
import type {
  Location,
  LocationCommission,
  LocationInput,
  LocationRepository,
} from "./LocationRepository.ts";

type LocationDoc = {
  _id: unknown;
  name: string;
  address?: {
    line1?: string | null;
    city?: string | null;
    state?: string | null;
    zip?: string | null;
    geo?: { lat: number; lng: number } | null;
  };
  contact?: {
    name?: string | null;
    phone?: string | null;
    email?: string | null;
  };
  commission: {
    type: "none" | "percent" | "flat";
    percentBps?: number | null;
    flatCents?: number | null;
    basis?: "gross" | "net" | null;
  };
  notes?: string | null;
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
};

/**
 * Mongoose-backed LocationRepository — the only place location persistence
 * lives. Every query filters by orgId and excludes soft-deleted documents.
 */
@injectable()
export class LocationRepositoryImpl implements LocationRepository {
  async findByOrg(orgId: string): Promise<Location[]> {
    const docs = await LocationModel.find({ orgId, deletedAt: null })
      .sort({ name: 1 })
      .lean<LocationDoc[]>();
    return docs.map(toLocation);
  }

  async findById(orgId: string, id: string): Promise<Location | null> {
    const doc = await LocationModel.findOne({
      _id: id,
      orgId,
      deletedAt: null,
    }).lean<LocationDoc | null>();
    return doc ? toLocation(doc) : null;
  }

  async findByIdIncludingDeleted(
    orgId: string,
    id: string,
  ): Promise<Location | null> {
    // No deletedAt predicate, on purpose — see the port. Still org-scoped.
    const doc = await LocationModel.findOne({
      _id: id,
      orgId,
    }).lean<LocationDoc | null>();
    return doc ? toLocation(doc) : null;
  }

  async create(orgId: string, data: LocationInput): Promise<Location> {
    const doc = await LocationModel.create({ orgId, ...data });
    return toLocation(doc.toObject() as LocationDoc);
  }

  async update(
    orgId: string,
    id: string,
    data: LocationInput,
  ): Promise<Location | null> {
    const doc = await LocationModel.findOneAndUpdate(
      { _id: id, orgId, deletedAt: null },
      data,
      { returnDocument: "after" },
    ).lean<LocationDoc | null>();
    return doc ? toLocation(doc) : null;
  }

  async softDelete(orgId: string, id: string): Promise<void> {
    await LocationModel.updateOne(
      { _id: id, orgId, deletedAt: null },
      { deletedAt: new Date() },
    );
  }
}

/**
 * The one place a loose document meets the strict union. Writes go through
 * zod's discriminated union and the service's normalizer, so a stored
 * commission is always consistent — but a hand-edited document could still
 * claim "percent" with no basis points. Falling back to "none" keeps one bad
 * record from breaking the whole locations list.
 */
export function toCommission(
  doc: LocationDoc["commission"],
): LocationCommission {
  if (doc.type === "percent" && doc.percentBps != null) {
    return {
      type: "percent",
      percentBps: doc.percentBps,
      basis: doc.basis ?? "gross",
    };
  }
  if (doc.type === "flat" && doc.flatCents != null) {
    return { type: "flat", flatCents: doc.flatCents };
  }
  return { type: "none" };
}

function toLocation(doc: LocationDoc): Location {
  return {
    id: String(doc._id),
    name: doc.name,
    address: {
      line1: doc.address?.line1 ?? null,
      city: doc.address?.city ?? null,
      state: doc.address?.state ?? null,
      zip: doc.address?.zip ?? null,
      geo: doc.address?.geo
        ? { lat: doc.address.geo.lat, lng: doc.address.geo.lng }
        : null,
    },
    contact: {
      name: doc.contact?.name ?? null,
      phone: doc.contact?.phone ?? null,
      email: doc.contact?.email ?? null,
    },
    commission: toCommission(doc.commission),
    notes: doc.notes ?? null,
    active: doc.active,
    createdAt: doc.createdAt.toISOString(),
    updatedAt: doc.updatedAt.toISOString(),
  };
}
