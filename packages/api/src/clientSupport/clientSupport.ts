/**
 * Policy for deciding whether a client build is still supported. Shared by the
 * `system.clientSupport` procedure and the HTTP gate so the launch check and
 * the backstop cannot disagree.
 */

export type UpdateRequirement = "none" | "recommended" | "required";

/** `X-Vendpire-Client: ios/42`. Digits only, so a marketing version won't parse. */
const IOS_CLIENT = /^ios\/(\d+)$/;

/** Procedures that stay reachable to a client the floor has refused. */
const UNGATED_PREFIX = "system.";

export interface ClientBuild {
  platform: "ios";
  build: number;
}

interface BuildFloor {
  minimumBuild: number;
  recommendedBuild: number;
}

/** Both floors are inclusive: a build equal to the minimum is supported. */
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

// httpBatchLink joins a batch's procedure names with commas, so this path is a
// list. The query string is dropped first — batched input is JSON, itself full
// of commas.
function isEntirelyUngated(path: string): boolean {
  const [withoutQuery = ""] = path.split("?");
  const procedures = withoutQuery.replace(/^\//, "").split(",");
  return procedures.every((procedure) => procedure.startsWith(UNGATED_PREFIX));
}

/**
 * Whether this request must be refused with `426`. False for anything it
 * cannot identify as a too-old iOS build: the web bundle and the e2e health
 * check send no client header.
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
