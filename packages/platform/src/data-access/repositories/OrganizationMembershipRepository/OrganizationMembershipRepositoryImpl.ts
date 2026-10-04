import { injectable } from "tsyringe";
import { OrganizationMembershipModel } from "../../models/OrganizationMembership.ts";
import type {
  OrganizationMembership,
  OrganizationMembershipInput,
  OrganizationMembershipRepository,
} from "./OrganizationMembershipRepository.ts";

type OrganizationMembershipDoc = {
  _id: unknown;
  orgId: string;
  authUserId: string;
  role: string;
  createdAt: Date;
  updatedAt: Date;
};

/**
 * Mongoose-backed OrganizationMembershipRepository. Documents are mapped to the
 * plain entity so Mongoose types never escape.
 */
@injectable()
export class OrganizationMembershipRepositoryImpl
  implements OrganizationMembershipRepository
{
  async upsertByOrgAndUser({
    orgId,
    authUserId,
    role,
  }: OrganizationMembershipInput): Promise<OrganizationMembership> {
    // $set the role so a promotion lands, and clear deletedAt so re-adding a
    // removed member revives the row rather than leaving it invisible.
    const doc = await OrganizationMembershipModel.findOneAndUpdate(
      { orgId, authUserId },
      { $set: { role, deletedAt: null } },
      { upsert: true, returnDocument: "after" },
    ).lean<OrganizationMembershipDoc>();

    return toOrganizationMembership(doc);
  }

  async findByOrg(orgId: string): Promise<OrganizationMembership[]> {
    const docs = await OrganizationMembershipModel.find({
      orgId,
      deletedAt: null,
    }).lean<OrganizationMembershipDoc[]>();
    return docs.map(toOrganizationMembership);
  }

  async findByUser(authUserId: string): Promise<OrganizationMembership[]> {
    const docs = await OrganizationMembershipModel.find({
      authUserId,
      deletedAt: null,
    }).lean<OrganizationMembershipDoc[]>();
    return docs.map(toOrganizationMembership);
  }

  async softDeleteByOrgAndUser(
    orgId: string,
    authUserId: string,
  ): Promise<void> {
    await OrganizationMembershipModel.updateOne(
      { orgId, authUserId, deletedAt: null },
      { $set: { deletedAt: new Date() } },
    );
  }
}

export function toOrganizationMembership(
  doc: OrganizationMembershipDoc,
): OrganizationMembership {
  return {
    id: String(doc._id),
    orgId: doc.orgId,
    authUserId: doc.authUserId,
    role: doc.role,
    createdAt: doc.createdAt.toISOString(),
    updatedAt: doc.updatedAt.toISOString(),
  };
}
