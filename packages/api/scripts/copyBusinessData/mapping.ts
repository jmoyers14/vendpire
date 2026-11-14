/**
 * The pure half of copyBusinessData: deciding which Clerk ids map to which.
 * Kept free of Mongo and Clerk so the mapping rules are testable.
 */

/** The collections that hold one business's data, all keyed by `orgId`. */
export const BUSINESS_COLLECTIONS = [
  "locations",
  "machines",
  "machinetemplates",
  "packs",
  "planograms",
  "products",
  "purchases",
  "visits",
] as const;

export type BusinessCollection = (typeof BUSINESS_COLLECTIONS)[number];

export interface IdMapping {
  orgId: { from: string; to: string };
  /** Source Clerk user id → target Clerk user id. */
  userIds: Map<string, string>;
}

export type Resolution<T> =
  | { ok: true; value: T }
  | { ok: false; problem: string };

/** The one org the source holds, unless the caller named one. */
export const resolveSourceOrgId = (
  orgIdsFound: string[],
  requested: string | undefined,
): Resolution<string> => {
  const distinct = [...new Set(orgIdsFound)];
  if (requested !== undefined) {
    return distinct.includes(requested)
      ? { ok: true, value: requested }
      : { ok: false, problem: `--source-org ${requested} has no documents in the source` };
  }
  if (distinct.length === 1) {
    return { ok: true, value: distinct[0] };
  }
  if (distinct.length === 0) {
    return { ok: false, problem: "the source holds no business documents" };
  }
  return {
    ok: false,
    problem: `the source holds ${distinct.length} orgs (${distinct.join(", ")}); pick one with --source-org`,
  };
};

/**
 * Pairs each source user with the target user who has the same email. Every
 * source user must match: a visit can't be credited to nobody.
 */
export const buildUserIdMap = ({
  sourceUserIds,
  sourceEmailByUserId,
  targetUserIdByEmail,
}: {
  sourceUserIds: string[];
  sourceEmailByUserId: Map<string, string>;
  targetUserIdByEmail: Map<string, string>;
}): Resolution<Map<string, string>> => {
  const userIds = new Map<string, string>();
  const problems: string[] = [];
  for (const sourceUserId of new Set(sourceUserIds)) {
    const email = sourceEmailByUserId.get(sourceUserId)?.toLowerCase();
    if (email === undefined) {
      problems.push(`${sourceUserId}: no email known in the source`);
      continue;
    }
    const targetUserId = targetUserIdByEmail.get(email);
    if (targetUserId === undefined) {
      problems.push(`${sourceUserId} (${email}): no target user with that email`);
      continue;
    }
    userIds.set(sourceUserId, targetUserId);
  }
  return problems.length === 0
    ? { ok: true, value: userIds }
    : { ok: false, problem: problems.join("\n") };
};

/** The one org every mapped user belongs to in the target, unless named. */
export const resolveTargetOrgId = (
  orgIdsPerUser: string[][],
  requested: string | undefined,
): Resolution<string> => {
  if (requested !== undefined) {
    return { ok: true, value: requested };
  }
  if (orgIdsPerUser.length === 0) {
    return { ok: false, problem: "no mapped users to infer the target org from; pass --target-org" };
  }
  const [first, ...rest] = orgIdsPerUser;
  const shared = first.filter((orgId) => rest.every((orgIds) => orgIds.includes(orgId)));
  if (shared.length === 1) {
    return { ok: true, value: shared[0] };
  }
  return {
    ok: false,
    problem:
      shared.length === 0
        ? "the mapped users share no org in the target; pass --target-org"
        : `the mapped users share ${shared.length} orgs (${shared.join(", ")}); pass --target-org`,
  };
};

/** A copy of one document with its Clerk ids swapped for the target's. */
export const toRemapped = <T extends Record<string, unknown>>(
  collection: BusinessCollection,
  document: T,
  mapping: IdMapping,
): T => {
  const remapped: Record<string, unknown> = { ...document, orgId: mapping.orgId.to };
  if (collection === "visits") {
    const recordedBy = document.recordedByUserId;
    if (typeof recordedBy !== "string" || !mapping.userIds.has(recordedBy)) {
      throw new Error(`visit ${String(document._id)}: recordedByUserId ${String(recordedBy)} is unmapped`);
    }
    remapped.recordedByUserId = mapping.userIds.get(recordedBy);
  }
  return remapped as T;
};

/** Hosts a pull may write to without `--allow-remote-target`. */
export const isLocalMongoUri = (uri: string): boolean => {
  const host = new URL(uri.replace(/^mongodb(\+srv)?:/, "http:")).hostname;
  return host === "localhost" || host === "127.0.0.1" || host === "::1" || host === "[::1]";
};

/** `host/db`, credentials stripped, for printing and for the source ≠ target check. */
export const describeMongoUri = (uri: string): string => {
  const url = new URL(uri.replace(/^mongodb(\+srv)?:/, "http:"));
  return `${url.host}${url.pathname}`;
};
