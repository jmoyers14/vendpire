/**
 * Policy for deciding whether a client build is still supported.
 *
 * Pure and standalone because two call sites need the same answer: the
 * `system.clientSupport` procedure, which hands a client its verdict, and the
 * HTTP gate in `index.ts`, which refuses a build the server can no longer
 * serve. Keeping one implementation is what stops the launch check and the
 * backstop from disagreeing. See `docs/diagrams/forced-update.md`.
 *
 * Comparison is always on the integer build number. The marketing version is
 * display-only — `1.10.0` sorts below `1.9.0` as a string.
 */

export type UpdateRequirement = "none" | "recommended" | "required";

/**
 * `X-Vendpire-Client: ios/42`. Anchored and digits-only so a marketing version
 * or a platform we have no policy for falls through to "unidentified" rather
 * than parsing into a misleading number.
 */
const IOS_CLIENT = /^ios\/(\d+)$/;

/**
 * Procedures that stay reachable to a client the floor has already refused —
 * the verdict it needs to render the wall, and the build stamp used for health
 * checks.
 */
const UNGATED_PREFIX = "system.";

export interface ClientBuild {
  platform: "ios";
  build: number;
}

interface BuildFloor {
  minimumBuild: number;
  recommendedBuild: number;
}

/**
 * Both floors are inclusive: a build equal to the minimum is supported. At the
 * default floor of `0` every build answers "none", which is how the mechanism
 * ships dark until someone sets the env var.
 */
export function updateRequirementFor({
  build,
  minimumBuild,
  recommendedBuild,
}: BuildFloor & { build: number }): UpdateRequirement {
  if (build < minimumBuild) {
    return "required";
  }
  if (build < recommendedBuild) {
    return "recommended";
  }
  return "none";
}

/**
 * Whether every procedure this request carries is one we leave reachable.
 *
 * tRPC's `httpBatchLink` serializes a batch as the comma-joined procedure
 * names, so this path can be a list — `system.version,visits.create` — and a
 * prefix match would wave the whole batch through on the strength of its first
 * entry. One gated procedure anywhere in the batch gates all of it, because
 * tRPC runs them together and the response is all-or-nothing.
 *
 * The query string is dropped before splitting: a batch carries its inputs as
 * JSON, which is itself full of commas, and treating those as procedure names
 * would gate `system.clientSupport` — making the wall unreachable for exactly
 * the clients it exists for.
 */
function isEntirelyUngated(path: string): boolean {
  const [withoutQuery = ""] = path.split("?");
  const procedures = withoutQuery.replace(/^\//, "").split(",");
  return procedures.every((procedure) => procedure.startsWith(UNGATED_PREFIX));
}

/** Returns null for an absent, foreign, or malformed stamp. */
export function parseClientHeader(
  raw: string | string[] | undefined,
): ClientBuild | null {
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (value === undefined) {
    return null;
  }
  const match = IOS_CLIENT.exec(value);
  if (match === null) {
    return null;
  }
  return { platform: "ios", build: Number(match[1]) };
}

/**
 * Whether this request must be refused with `426`.
 *
 * Deliberately false for anything it cannot positively identify as a too-old
 * iOS build: the web bundle and the e2e health check send no client header at
 * all, so a gate that blocked unidentified callers would take down both.
 */
export function isUnsupportedClient({
  header,
  path,
  minimumBuild,
  recommendedBuild,
}: BuildFloor & {
  header: string | string[] | undefined;
  path: string;
}): boolean {
  if (isEntirelyUngated(path)) {
    return false;
  }
  const client = parseClientHeader(header);
  if (client === null) {
    return false;
  }
  const requirement = updateRequirementFor({
    build: client.build,
    minimumBuild,
    recommendedBuild,
  });
  return requirement === "required";
}
