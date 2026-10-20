import { isUnsupportedClient } from "./clientSupport.ts";
import type { MobileConfig } from "../config/mobileConfig.ts";

/**
 * Only the parts of a request this gate reads. Declared structurally rather
 * than as `node:http`'s `IncomingMessage` because the `cors` types and Bun's
 * types disagree about that interface, and a gate that reads two fields has no
 * business taking a position on it.
 */
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
 * The `426` backstop: the server refusing to serve a build it can no longer
 * support.
 *
 * Runs upstream of the tRPC router because tRPC cannot produce this status —
 * its code table (`FORBIDDEN`→403, `PRECONDITION_FAILED`→412, …) has no entry
 * mapping to 426, and unmapped codes fall back to 500. A gate in front of
 * everything is also the semantics we want: one place decides, and no procedure
 * has to remember to check.
 *
 * The launch check at `system.clientSupport` is best-effort — a client that
 * launched offline has no answer and a cached one goes stale. This is what
 * turns it into a guarantee. See `docs/diagrams/forced-update.md`.
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

    // Carry the destination in the refusal: this fires precisely when the
    // launch check didn't, so the client may never have been told where to go.
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
