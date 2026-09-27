import { injectable } from "tsyringe";
import { LocationModel } from "../../models/Location.ts";
import type {
  Location,
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

function toLocation(doc: LocationDoc): Location {
  return {
    id: String(doc._id),
    name: doc.name,
    address: {
      line1: doc.address?.line1 ?? null,
      city: doc.address?.city ?? null,
      state: doc.address?.state ?? null,
      zip: doc.address?.zip ?? null,
    },
    contact: {
      name: doc.contact?.name ?? null,
      phone: doc.contact?.phone ?? null,
      email: doc.contact?.email ?? null,
    },
    commission: {
      type: doc.commission.type,
      percentBps: doc.commission.percentBps ?? null,
      flatCents: doc.commission.flatCents ?? null,
      basis: doc.commission.basis ?? null,
    },
    notes: doc.notes ?? null,
    active: doc.active,
    createdAt: doc.createdAt.toISOString(),
    updatedAt: doc.updatedAt.toISOString(),
  };
}
