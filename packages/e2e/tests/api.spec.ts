import { test, expect } from "../fixtures.ts";

// Pure API specs: use the worker's api directly (no browser, no Clerk keys).

test("system.version returns the build stamp", async ({ apiStack }) => {
  const response = await fetch(`${apiStack.apiUrl}/system.version`);
  expect(response.ok).toBe(true);
  const body = (await response.json()) as {
    result: { data: { version: string; environment: string } };
  };
  expect(body.result.data.version).toBeTruthy();
  expect(body.result.data.environment).toBe("local");
});

test("auth.me rejects unauthenticated callers", async ({ apiStack }) => {
  const response = await fetch(`${apiStack.apiUrl}/auth.me`);
  expect(response.status).toBe(401);
});
