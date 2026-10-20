/**
 * Connect-style middleware, the shape the tRPC standalone adapter accepts.
 * Distinct from a tRPC `.use()` middleware in trpc.ts: these run at the HTTP
 * layer, before the router sees a request.
 *
 * Request and response are declared structurally rather than as `node:http`'s
 * types because the `cors` and Bun typings disagree about `IncomingMessage`.
 */
export interface MiddlewareRequest {
  url?: string | undefined;
  method?: string | undefined;
  headers: Record<string, string | string[] | undefined>;
}

export interface MiddlewareResponse {
  statusCode: number;
  setHeader(name: string, value: string): unknown;
  end(body?: string): unknown;
}

export type HttpMiddleware = (
  req: MiddlewareRequest,
  res: MiddlewareResponse,
  next: (err?: unknown) => void,
) => void;
