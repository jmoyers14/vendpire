import net from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn, type ChildProcess } from "node:child_process";
import { test as base } from "@playwright/test";
import { MongoMemoryServer } from "mongodb-memory-server";

/**
 * Worker-scoped stack fixtures. Each Playwright worker boots its OWN stack —
 * an in-memory MongoDB, the api on a free port, and the Vite dev server on a
 * free port — so workers run fully parallel with isolated databases and no
 * port collisions. The stack tears down when the worker exits.
 *
 * Layered so api-only specs stay cheap and key-free:
 *   apiStack  — in-memory Mongo + api process (no Clerk keys needed; the api
 *               only validates its Clerk config when a token is presented)
 *   webStack  — Vite dev server pointed at this worker's api. Requires a Clerk
 *               publishable key (the web app refuses to boot without one), so
 *               browser specs skip via `browserTest` when keys are absent.
 */

const repoRoot = fileURLToPath(new URL("../..", import.meta.url));

export interface ApiStack {
  apiUrl: string;
  mongoUri: string;
}

export interface WebStack {
  webUrl: string;
}

/** An OS-assigned free port. The listener closes before the server spawns, so
 * pair consumers with strict-port flags to fail loudly on the rare race. */
const freePort = (): Promise<number> =>
  new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.once("error", reject);
    srv.listen(0, () => {
      const address = srv.address() as net.AddressInfo;
      srv.close(() => resolve(address.port));
    });
  });

const waitForHttp = async (url: string, timeoutMs: number): Promise<void> => {
  const deadline = Date.now() + timeoutMs;
  let lastError: unknown = null;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);
      if (response.ok) {
        return;
      }
      lastError = new Error(`HTTP ${response.status}`);
    } catch (error) {
      lastError = error;
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`Timed out waiting for ${url}: ${String(lastError)}`);
};

/** Kill the process group (vite/bun spawn children of their own). */
const stop = (child: ChildProcess): void => {
  if (child.pid === undefined) {
    return;
  }
  try {
    process.kill(-child.pid, "SIGTERM");
  } catch {
    // Already exited.
  }
};

type WorkerFixtures = {
  apiStack: ApiStack;
  webStack: WebStack;
};

export const test = base.extend<Record<never, never>, WorkerFixtures>({
  apiStack: [
    async ({}, use) => {
      const mongo = await MongoMemoryServer.create();
      const port = await freePort();
      const apiUrl = `http://localhost:${port}`;

      const api = spawn("bun", ["src/index.ts"], {
        cwd: path.join(repoRoot, "packages/api"),
        detached: true,
        stdio: "ignore",
        env: {
          ...process.env,
          ENVIRONMENT: "local",
          PORT: String(port),
          MONGODB_URI: mongo.getUri("vendpire-e2e"),
          // A placeholder is fine without keys: the api only calls Clerk when
          // a Bearer token arrives, and browser specs (which do) skip keyless.
          CLERK_SECRET_KEY: process.env.CLERK_SECRET_KEY ?? "sk_test_placeholder",
          WEB_URL: "http://localhost:5173",
          POSTHOG_API_KEY: "",
        },
      });

      try {
        await waitForHttp(`${apiUrl}/system.version`, 30_000);
        await use({ apiUrl, mongoUri: mongo.getUri("vendpire-e2e") });
      } finally {
        stop(api);
        await mongo.stop();
      }
    },
    { scope: "worker" },
  ],

  webStack: [
    async ({ apiStack }, use) => {
      const port = await freePort();
      const webUrl = `http://localhost:${port}`;

      const web = spawn(
        "bun",
        ["x", "vite", "dev", "--port", String(port), "--strictPort"],
        {
          cwd: path.join(repoRoot, "packages/web"),
          detached: true,
          stdio: "ignore",
          env: {
            ...process.env,
            VITE_API_URL: apiStack.apiUrl,
            VITE_CLERK_PUBLISHABLE_KEY:
              process.env.CLERK_PUBLISHABLE_KEY ?? "",
          },
        },
      );

      try {
        await waitForHttp(webUrl, 30_000);
        await use({ webUrl });
      } finally {
        stop(web);
      }
    },
    { scope: "worker" },
  ],

  // Point every page/context at this worker's own web server.
  baseURL: async ({ webStack }, use) => {
    await use(webStack.webUrl);
  },
});

export const expect = test.expect;

/** Guard for specs that drive the browser: they need a real Clerk publishable
 * key to render at all. Call at the top of the file. */
export const requireClerkKeys = (): void => {
  test.skip(
    !process.env.CLERK_PUBLISHABLE_KEY || !process.env.CLERK_SECRET_KEY,
    "Set CLERK_PUBLISHABLE_KEY + CLERK_SECRET_KEY in packages/e2e/.env",
  );
};

/** Guard for specs that sign in: they additionally need a test user. */
export const requireTestUser = (): void => {
  requireClerkKeys();
  test.skip(
    !process.env.E2E_CLERK_USER_EMAIL || !process.env.E2E_CLERK_USER_PASSWORD,
    "Set E2E_CLERK_USER_EMAIL + E2E_CLERK_USER_PASSWORD in packages/e2e/.env",
  );
};
