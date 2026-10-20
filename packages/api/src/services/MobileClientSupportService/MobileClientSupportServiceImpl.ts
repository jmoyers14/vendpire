import { inject, injectable } from "tsyringe";
import {
  MOBILE_CONFIG_TOKEN,
  type MobileConfig,
} from "../../config/mobileConfig.ts";
import type {
  ClientRequest,
  MobileClientSupportService,
  UpdateRequirement,
} from "./MobileClientSupportService.ts";

/** `X-Vendpire-Client: ios/42`. Digits only, so a marketing version won't parse. */
const IOS_CLIENT = /^ios\/(\d+)$/;

/** Procedures that stay reachable to a client the floor has refused. */
const UNGATED_PREFIX = "system.";

/**
 * Decides whether an iOS build is still supported. One implementation answers
 * both the launch check and the `426` gate, so the two cannot disagree.
 */
@injectable()
export class MobileClientSupportServiceImpl
  implements MobileClientSupportService
{
  constructor(
    @inject(MOBILE_CONFIG_TOKEN) private readonly config: MobileConfig,
  ) {}

  get updateUrl(): string {
    return this.config.iosUpdateUrl;
  }

  /** Both floors are inclusive: a build equal to the minimum is supported. */
  verdictFor(build: number): UpdateRequirement {
    if (build < this.config.iosMinimumBuild) {
      return "required";
    }
    if (build < this.config.iosRecommendedBuild) {
      return "recommended";
    }
    return "none";
  }

  isUnsupportedRequest({ header, path }: ClientRequest): boolean {
    if (isEntirelyUngated(path)) {
      return false;
    }
    const build = parseClientBuild(header);
    if (build === null) {
      return false;
    }
    return this.verdictFor(build) === "required";
  }
}

/** Returns null for an absent, foreign, or malformed stamp. */
function parseClientBuild(raw: string | string[] | undefined): number | null {
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (value === undefined) {
    return null;
  }
  const match = IOS_CLIENT.exec(value);
  if (match === null) {
    return null;
  }
  return Number(match[1]);
}

// httpBatchLink joins a batch's procedure names with commas, so this path is a
// list. The query string is dropped first — batched input is JSON, itself full
// of commas.
function isEntirelyUngated(path: string): boolean {
  const [withoutQuery = ""] = path.split("?");
  const procedures = withoutQuery.replace(/^\//, "").split(",");
  return procedures.every((procedure) => procedure.startsWith(UNGATED_PREFIX));
}
