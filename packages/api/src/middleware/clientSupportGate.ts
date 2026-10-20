import type { MobileClientSupportService } from "../services/MobileClientSupportService/MobileClientSupportService.ts";
import type { HttpMiddleware } from "./types.ts";

/**
 * Refuses a build below the floor with `426`, the backstop for when the launch
 * check never ran or its answer went stale. Runs upstream of the router
 * because tRPC has no error code that maps to 426 — unmapped codes become 500.
 */
export function buildClientSupportGate(
  clientSupport: MobileClientSupportService,
): HttpMiddleware {
  return (req, res, next) => {
    const blocked = clientSupport.isUnsupportedRequest({
      header: req.headers["x-vendpire-client"],
      path: req.url ?? "",
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
          updateUrl: clientSupport.updateUrl,
        },
      }),
    );
  };
}
