import { injectable } from "tsyringe";
import { OrganizationModel } from "../../models/Organization.ts";
import type {
  Organization,
  OrganizationInput,
  OrganizationRepository,
} from "./OrganizationRepository.ts";

type OrganizationDoc = {
  _id: unknown;
  orgId: string;
  name: string;
  slug: string | null;
  imageUrl: string | null;
  createdAt: Date;
  updatedAt: Date;
};

/**
 * Mongoose-backed OrganizationRepository. Documents are mapped to the plain
 * Organization entity so Mongoose types never escape.
 */
@injectable()
export class OrganizationRepositoryImpl implements OrganizationRepository {
  async upsertByOrgId({
    orgId,
    ...fields
  }: OrganizationInput): Promise<Organization> {
    // $set on the mutable fields: a rename in Clerk should land here. deletedAt
    // is cleared too, so an org that was deleted and recreated under the same id
    // comes back rather than staying invisible.
    const doc = await OrganizationModel.findOneAndUpdate(
      { orgId },
      { $set: { ...fields, deletedAt: null } },
      { upsert: true, returnDocument: "after" },
    ).lean<OrganizationDoc>();

    return toOrganization(doc);
  }

  async findByOrgId(orgId: string): Promise<Organization | null> {
    const doc = await OrganizationModel.findOne({
      orgId,
      deletedAt: null,
    }).lean<OrganizationDoc | null>();
    return doc ? toOrganization(doc) : null;
  }

  async softDeleteByOrgId(orgId: string): Promise<void> {
    await OrganizationModel.updateOne(
      { orgId, deletedAt: null },
      { $set: { deletedAt: new Date() } },
    );
  }
}

export function toOrganization(doc: OrganizationDoc): Organization {
  return {
    id: String(doc._id),
    orgId: doc.orgId,
    name: doc.name,
    slug: doc.slug ?? null,
    imageUrl: doc.imageUrl ?? null,
    createdAt: doc.createdAt.toISOString(),
    updatedAt: doc.updatedAt.toISOString(),
  };
}
