import type { AgentIdentity } from "../../services/AuthService/AuthService.ts";
import { AgentToolError } from "./AgentTool.ts";

interface ResolvedBusiness {
  orgId: string;
  orgName: string;
}

const describe = (identity: AgentIdentity): Record<string, unknown> => ({
  businesses: identity.memberships.map((membership) => ({
    id: membership.orgId,
    name: membership.orgName,
  })),
});

/**
 * An OAuth grant names a user, not a business, so every tool call has to decide
 * which org it reads. Implicit only when there is exactly one membership --
 * otherwise the model is told to name one rather than having a business picked
 * for it, because picking wrong means reporting another business's numbers.
 */
export const resolveBusiness = (
  identity: AgentIdentity,
  business: string | undefined,
): ResolvedBusiness => {
  const { memberships } = identity;

  if (memberships.length === 0) {
    throw new AgentToolError(
      "This Vendpire account does not belong to any business yet, so there is nothing to read.",
    );
  }

  if (business === undefined) {
    const only = memberships[0];
    if (memberships.length === 1 && only !== undefined) {
      return { orgId: only.orgId, orgName: only.orgName };
    }
    throw new AgentToolError(
      "This account belongs to more than one business. Say which one, then call the tool again with `business` set.",
      describe(identity),
    );
  }

  const wanted = business.trim().toLowerCase();
  const matches = memberships.filter(
    (membership) =>
      membership.orgId.toLowerCase() === wanted ||
      membership.orgName.toLowerCase() === wanted ||
      membership.orgSlug?.toLowerCase() === wanted ||
      membership.orgName.toLowerCase().includes(wanted),
  );

  const first = matches[0];
  if (first === undefined) {
    throw new AgentToolError(
      `No business of this account matches "${business}".`,
      describe(identity),
    );
  }
  if (matches.length > 1) {
    throw new AgentToolError(
      `"${business}" matches more than one business. Use the full name or the id.`,
      {
        businesses: matches.map((match) => ({
          id: match.orgId,
          name: match.orgName,
        })),
      },
    );
  }
  return { orgId: first.orgId, orgName: first.orgName };
};
