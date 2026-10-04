import { beforeEach, describe, expect, it } from "bun:test";
import { makeJob } from "@vendpire/platform/test-support";
import { JobRunner } from "./runJob.ts";
import { JobHandlerRegistry } from "./registry.ts";
import { PoisonJobError } from "./PoisonJobError.ts";
import type { JobHandler } from "./JobHandler.ts";
import { FakeJobRepository, noopLogger } from "../test-support/fakes.ts";

/**
 * The runner's return status IS the retry contract — Cloud Tasks retries any
 * non-2xx — so every case here is really asserting "retry" or "don't".
 */

const JOB_TYPE = "syncUser";
const DEDUP_KEY = "clerk:msg_1";

const registryWith = (handler: JobHandler | null): JobHandlerRegistry =>
  ({ get: () => handler }) as unknown as JobHandlerRegistry;

const task = (body: unknown): Request =>
  new Request(`https://worker.local/tasks/${JOB_TYPE}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

let jobs: FakeJobRepository;

const runner = (handler: JobHandler | null): JobRunner =>
  new JobRunner(jobs, registryWith(handler), noopLogger);

/** A handler that records whether it ran, and can be told to fail. */
const handlerThat = (behaviour: () => unknown): JobHandler & { ran: boolean } => {
  const handler = {
    ran: false,
    async handle() {
      handler.ran = true;
      return behaviour();
    },
  };
  return handler;
};

beforeEach(() => {
  jobs = new FakeJobRepository();
  jobs.seed(makeJob({ jobType: JOB_TYPE, dedupKey: DEDUP_KEY }));
});

describe("JobRunner — unaddressable tasks", () => {
  it("acks a malformed task body, because no retry could find the job", async () => {
    const result = await runner(handlerThat(() => undefined)).run(
      JOB_TYPE,
      task({ nope: true }),
    );

    expect(result.status).toBe(200);
    expect(jobs.calls).toHaveLength(0);
  });

  it("acks a task with an unparseable body", async () => {
    const broken = new Request(`https://worker.local/tasks/${JOB_TYPE}`, {
      method: "POST",
      body: "not json",
    });

    const result = await runner(handlerThat(() => undefined)).run(
      JOB_TYPE,
      broken,
    );

    expect(result.status).toBe(200);
  });

  it("acks a task whose job row is missing, rather than retrying forever", async () => {
    const result = await runner(handlerThat(() => undefined)).run(
      JOB_TYPE,
      task({ dedupKey: "clerk:never-written" }),
    );

    expect(result.status).toBe(200);
    expect(result.body).toEqual({ error: "job not found" });
  });
});

describe("JobRunner — idempotency backstop", () => {
  it("acks a redelivery of an already-succeeded job without re-running it", async () => {
    jobs.seed(
      makeJob({
        jobType: JOB_TYPE,
        dedupKey: DEDUP_KEY,
        status: "succeeded",
        attempts: 1,
      }),
    );
    const handler = handlerThat(() => undefined);

    const result = await runner(handler).run(JOB_TYPE, task({ dedupKey: DEDUP_KEY }));

    expect(result.status).toBe(200);
    expect(result.body).toEqual({ status: "already-succeeded" });
    // This is the guard for when the queue's task-name dedup window has lapsed.
    expect(handler.ran).toBe(false);
    expect(jobs.calls).toHaveLength(0);
  });
});

describe("JobRunner — unknown job type", () => {
  it("marks the job failed and acks, since this deploy can never run it", async () => {
    const result = await runner(null).run(JOB_TYPE, task({ dedupKey: DEDUP_KEY }));

    expect(result.status).toBe(200);
    expect(jobs.calls).toEqual(["markFailed"]);
    const job = await jobs.findByKey(JOB_TYPE, DEDUP_KEY);
    expect(job?.lastError).toMatch(/no handler registered/);
  });
});

describe("JobRunner — success", () => {
  it("counts the attempt, runs the handler, records the result, and acks", async () => {
    const result = await runner(handlerThat(() => ({ mirrored: true }))).run(
      JOB_TYPE,
      task({ dedupKey: DEDUP_KEY }),
    );

    expect(result.status).toBe(200);
    expect(result.body).toEqual({ status: "succeeded", jobType: JOB_TYPE });
    // markRunning precedes the work, so `attempts` is truthful even if the
    // instance dies mid-run.
    expect(jobs.calls).toEqual(["markRunning", "markSucceeded"]);
    const job = await jobs.findByKey(JOB_TYPE, DEDUP_KEY);
    expect(job?.status).toBe("succeeded");
    expect(job?.attempts).toBe(1);
    expect(job?.result).toEqual({ mirrored: true });
  });
});

describe("JobRunner — failure", () => {
  it("500s an ordinary throw, so the queue retries it", async () => {
    const result = await runner(
      handlerThat(() => {
        throw new Error("mongo unreachable");
      }),
    ).run(JOB_TYPE, task({ dedupKey: DEDUP_KEY }));

    expect(result.status).toBe(500);
    expect(result.body).toEqual({ error: "mongo unreachable" });
    expect(jobs.calls).toEqual(["markRunning", "markFailed"]);
  });

  it("acks a PoisonJobError after recording it, because a retry cannot help", async () => {
    const result = await runner(
      handlerThat(() => {
        throw new PoisonJobError("raw event missing");
      }),
    ).run(JOB_TYPE, task({ dedupKey: DEDUP_KEY }));

    // 200, not 500 — burning the queue's attempts on unwinnable work just
    // delays the failure showing up.
    expect(result.status).toBe(200);
    expect(result.body).toEqual({ error: "raw event missing" });
    const job = await jobs.findByKey(JOB_TYPE, DEDUP_KEY);
    expect(job?.status).toBe("failed");
    expect(job?.lastError).toBe("raw event missing");
  });

  it("records a non-Error throw without crashing the runner", async () => {
    const result = await runner(
      handlerThat(() => {
        throw "a bare string";
      }),
    ).run(JOB_TYPE, task({ dedupKey: DEDUP_KEY }));

    expect(result.status).toBe(500);
    expect(result.body).toEqual({ error: "a bare string" });
  });
});
