import cors from "cors";
import { buildClientSupportGate } from "./clientSupportGate.ts";
import type { MobileClientSupportService } from "../services/MobileClientSupportService/MobileClientSupportService.ts";
import type { HttpMiddleware } from "./types.ts";

export type { HttpMiddleware } from "./types.ts";

/**
 * The HTTP chain in front of the router. The adapter takes one middleware, so
 * the links are composed here: CORS first, so even a refusal carries the
 * headers a browser needs to read it.
 */
export function buildHttpMiddleware({
  webUrl,
  clientSupport,
}: {
  webUrl: string;
  clientSupport: MobileClientSupportService;
}): HttpMiddleware {
  const allowOrigin = cors({ origin: webUrl, credentials: true });
  const refuseUnsupportedClients = buildClientSupportGate(clientSupport);

  return (req, res, next) => {
    allowOrigin(req, res, (err?: unknown) => {
      if (err !== undefined && err !== null) {
        next(err);
        return;
      }
      refuseUnsupportedClients(req, res, next);
    });
  };
}
