import { isUnsupportedClient } from "./clientSupport.ts";
import type { MobileConfig } from "../config/mobileConfig.ts";

/** Only the parts of a request the gate reads — the `cors` and Bun typings disagree about `IncomingMessage`. */
interface GateRequest {
  url?: string | undefined;
  headers: Record<string, string | string[] | undefined>;
}

interface GateResponse {
  statusCode: number;
  setHeader(name: string, value: string): unknown;
  end(body?: string): unknown;
}

/** Connect-style middleware, the shape the tRPC standalone adapter accepts. */
type Gate = (
  req: GateRequest,
  res: GateResponse,
  next: (err?: unknown) => void,
) => void;

/**
 * Refuses a build below the floor with `426`, the backstop for when the launch
 * check never ran or its answer went stale. Runs upstream of the router
 * because tRPC has no error code that maps to 426 — unmapped codes become 500.
 */
export function buildClientSupportGate(config: MobileConfig): Gate {
  return (req, res, next) => {
    const blocked = isUnsupportedClient({
      header: req.headers["x-vendpire-client"],
      path: req.url ?? "",
      minimumBuild: config.iosMinimumBuild,
      recommendedBuild: config.iosRecommendedBuild,
    });

    if (!blocked) {
      next();
      return;
    }

    res.statusCode = 426;
    res.setHeader("content-type", "application/json");
    res.end(
      JSON.stringify({
        error: {
          code: "UPGRADE_REQUIRED",
          message: "This app version is no longer supported. Please update.",
          updateUrl: config.iosUpdateUrl,
        },
      }),
    );
  };
}
