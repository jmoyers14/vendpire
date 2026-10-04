import type { TaskAuthenticator } from "@vendpire/platform";
import type { IngestService } from "./ingest/handler.ts";
import type { JobRunner } from "./jobs/runJob.ts";

/**
 * The collaborators the router delegates to. Injected rather than resolved
 * inside, so the routing itself stays a pure function of its dependencies and is
 * unit-testable with fakes, no container or port binding required.
 */
export interface RouterDeps {
  ingest: IngestService;
  runner: JobRunner;
  taskAuth: TaskAuthenticator;
}

/**
 * Builds the worker's request handler. Three surfaces, different callers:
 *  - `GET  /health`        — Cloud Run's startup/liveness probe.
 *  - `POST /ingest/clerk`  — Clerk's webhook sender. Delegated to IngestService,
 *                            which verifies the signature before anything else.
 *  - `POST /tasks/:type`   — Cloud Tasks delivering a job. Authenticated first
 *                            (the only guard on an otherwise-public endpoint),
 *                            then delegated to the JobRunner.
 *
 * The webhook source is in the path (`/ingest/clerk`), not sniffed from headers:
 * signature verification is per-source, so the source must be known before the
 * request is trusted. A second source adds a sibling path and its own verifier.
 */
export function createRequestHandler(
  deps: RouterDeps,
): (request: Request) => Promise<Response> {
  return async (request: Request): Promise<Response> => {
    const { pathname } = new URL(request.url);
    const { method } = request;

    if (method === "GET" && pathname === "/health") {
      return json({ status: "ok" }, 200);
    }

    if (method === "POST" && pathname === "/ingest/clerk") {
      const result = await deps.ingest.handleClerk(request);
      return json(result.body, result.status);
    }

    if (method === "POST" && pathname.startsWith("/tasks/")) {
      const allowed = await deps.taskAuth.authenticate(request);
      if (!allowed) {
        return json({ error: "unauthorized" }, 403);
      }
      const jobType = pathname.slice("/tasks/".length);
      if (jobType.length === 0) {
        return json({ error: "Not found" }, 404);
      }
      const result = await deps.runner.run(jobType, request);
      return json(result.body, result.status);
    }

    return json({ error: "Not found" }, 404);
  };
}

const json = (body: unknown, status: number): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
