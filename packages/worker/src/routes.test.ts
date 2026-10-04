import { describe, expect, it } from "bun:test";
import type { TaskAuthenticator } from "@vendpire/platform";
import { createRequestHandler, type RouterDeps } from "./routes.ts";
import type { IngestService } from "./ingest/handler.ts";
import type { JobRunner } from "./jobs/runJob.ts";

const deps = (overrides: Partial<RouterDeps> = {}): RouterDeps => ({
  ingest: {
    handleClerk: async () => ({ status: 202, body: { status: "queued" } }),
  } as unknown as IngestService,
  runner: {
    run: async () => ({ status: 200, body: { status: "succeeded" } }),
  } as unknown as JobRunner,
  taskAuth: { authenticate: async () => true } as TaskAuthenticator,
  ...overrides,
});

const request = (method: string, path: string): Request =>
  new Request(`http://worker.local${path}`, { method });

describe("createRequestHandler", () => {
  it("answers the health probe", async () => {
    const response = await createRequestHandler(deps())(
      request("GET", "/health"),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: "ok" });
  });

  it("404s an unknown path", async () => {
    const response = await createRequestHandler(deps())(request("GET", "/nope"));

    expect(response.status).toBe(404);
  });

  it("404s the right path under the wrong method", async () => {
    const response = await createRequestHandler(deps())(
      request("GET", "/ingest/clerk"),
    );

    expect(response.status).toBe(404);
  });

  it("404s an unknown webhook source rather than guessing a verifier", async () => {
    // Verification is per-source, so a source we have no verifier for must not
    // fall through to one that happens to be wired up.
    const response = await createRequestHandler(deps())(
      request("POST", "/ingest/stripe"),
    );

    expect(response.status).toBe(404);
  });

  it("delegates the Clerk webhook to the ingest service", async () => {
    const response = await createRequestHandler(deps())(
      request("POST", "/ingest/clerk"),
    );

    expect(response.status).toBe(202);
    expect(await response.json()).toEqual({ status: "queued" });
  });

  it("delegates a task to the runner with the job type from the path", async () => {
    // An array rather than a scalar: TypeScript doesn't track assignments made
    // inside the closure, so a `let` would narrow to null at the assertion.
    const seen: string[] = [];
    const response = await createRequestHandler(
      deps({
        runner: {
          run: async (jobType: string) => {
            seen.push(jobType);
            return { status: 200, body: { status: "succeeded" } };
          },
        } as unknown as JobRunner,
      }),
    )(request("POST", "/tasks/syncOrgMembership"));

    expect(seen).toEqual(["syncOrgMembership"]);
    expect(response.status).toBe(200);
  });

  it("403s a task the guard denies, without running it", async () => {
    const runs: string[] = [];
    const response = await createRequestHandler(
      deps({
        taskAuth: { authenticate: async () => false } as TaskAuthenticator,
        runner: {
          run: async (jobType: string) => {
            runs.push(jobType);
            return { status: 200, body: {} };
          },
        } as unknown as JobRunner,
      }),
    )(request("POST", "/tasks/syncUser"));

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: "unauthorized" });
    // The guard is the only thing closing these endpoints on a public service,
    // so it has to short-circuit — not merely change the status afterwards.
    expect(runs).toHaveLength(0);
  });

  it("404s a bare /tasks/ with no job type", async () => {
    const response = await createRequestHandler(deps())(
      request("POST", "/tasks/"),
    );

    expect(response.status).toBe(404);
  });
});
