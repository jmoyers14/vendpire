import { afterEach, describe, expect, it, mock } from "bun:test";
import { InlineTaskQueue } from "./InlineTaskQueue.ts";
import type { AppConfig } from "../../config/appConfig.ts";
import type { Logger } from "../../logging/Logger.ts";

const noopLogger = {
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
  fatal: () => {},
  child: () => noopLogger,
} as unknown as Logger;

const appConfig = (environment: string): AppConfig =>
  ({ environment }) as AppConfig;

const REQUEST = {
  queue: "user-sync-queue",
  jobType: "syncUser",
  name: "syncUser_clerk_msg_1_0",
  payload: { dedupKey: "clerk:msg_1" },
};

const originalFetch = globalThis.fetch;
const originalWorkerUrl = process.env.WORKER_URL;
const originalPort = process.env.PORT;

/** Captures the delivery without making one, and lets the test await it. */
function captureFetch() {
  let resolveCalled: (url: string) => void = () => {};
  const called = new Promise<string>((resolve) => {
    resolveCalled = resolve;
  });
  globalThis.fetch = mock(async (input: string | URL | Request) => {
    resolveCalled(String(input));
    return new Response("", { status: 200 });
  }) as unknown as typeof fetch;
  return called;
}

afterEach(() => {
  globalThis.fetch = originalFetch;
  process.env.WORKER_URL = originalWorkerUrl;
  process.env.PORT = originalPort;
});

describe("InlineTaskQueue", () => {
  it("delivers to WORKER_URL, not to the enqueuing process's own port", async () => {
    // The regression this guards: if the api ever enqueues, its PORT is 3210 —
    // deriving the target from PORT would post the task straight back to the
    // api, which has no /tasks route.
    process.env.WORKER_URL = "http://localhost:3211";
    process.env.PORT = "3210";
    const called = captureFetch();

    await new InlineTaskQueue(appConfig("local"), noopLogger).enqueue(REQUEST);

    expect(await called).toBe("http://localhost:3211/tasks/syncUser");
  });

  it("falls back to PORT when WORKER_URL is unset, as the worker enqueuing to itself", async () => {
    delete process.env.WORKER_URL;
    process.env.PORT = "3211";
    const called = captureFetch();

    await new InlineTaskQueue(appConfig("local"), noopLogger).enqueue(REQUEST);

    expect(await called).toBe("http://localhost:3211/tasks/syncUser");
  });

  it("refuses to run outside local, where its lack of retries would lose work", async () => {
    await expect(
      new InlineTaskQueue(appConfig("production"), noopLogger).enqueue(REQUEST),
    ).rejects.toThrow(/never run outside local/);
  });
});
