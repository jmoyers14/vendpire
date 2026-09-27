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
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  globalSetup: "./global-setup.ts",
  use: {
    trace: "on-first-retry",
    ...devices["Desktop Chrome"],
  },
});
