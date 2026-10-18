import { defineConfig, devices } from "@playwright/test";
import dotenv from "dotenv";
import { fileURLToPath } from "node:url";

// Keys for the stack the fixtures boot (Clerk dev instance + test user).
dotenv.config({ path: fileURLToPath(new URL(".env", import.meta.url)) });

export default defineConfig({
  testDir: "./tests",
  // Every worker boots its own isolated stack (in-memory Mongo + api + web),
  // so tests are free to run fully parallel — nothing is shared across workers.
  fullyParallel: true,
  // Unbounded parallelism assumes a dev machine's core count. A GitHub runner
  // has 2 cores, and one whole stack per worker thrashes it into timeouts.
  workers: process.env.CI ? 2 : undefined,
  // Fixture setup borrows the test timeout. At 30s Playwright kills
  // MongoMemoryServer mid-startup, so MMS never reports WHY mongod failed and
  // all we see is "fixture timeout". Give it room to surface the real error.
  timeout: process.env.CI ? 120_000 : 30_000,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  globalSetup: "./global-setup.ts",
  use: {
    trace: "on-first-retry",
    ...devices["Desktop Chrome"],
  },
});
