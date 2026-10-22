import { expect } from "@playwright/test";
import { test } from "../fixtures.ts";

/**
 * Unauthenticated coverage of the surface. Proving the routes are MOUNTED and
 * ORG-GATED needs no session: an org-scoped endpoint answering 401 to an
 * anonymous caller is exactly the evidence wanted, and a 404 would mean the
 * route never mounted at all. The authenticated read paths are covered by the
 * api's own unit tests against the same procedures.
 */
const ORG_SCOPED = [
  "/api/v1/locations",
  "/api/v1/machines",
  "/api/v1/products",
  "/api/v1/packs",
  "/api/v1/planograms/current",
  "/api/v1/visits/latest",
];

test.describe("the /api/v1 surface", () => {
  for (const route of ORG_SCOPED) {
    test(`${route} is mounted and refuses an anonymous caller`, async ({
      apiStack,
    }) => {
      const response = await fetch(`${apiStack.apiUrl}${route}`);

      expect(response.status).toBe(401);
    });
  }

  test("/api/v1/me is mounted and refuses an anonymous caller", async ({
    apiStack,
  }) => {
    const response = await fetch(`${apiStack.apiUrl}/api/v1/me`);

    expect(response.status).toBe(401);
  });

  test("POST /api/v1/visits is mounted and refuses an anonymous caller", async ({
    apiStack,
  }) => {
    const response = await fetch(`${apiStack.apiUrl}/api/v1/visits`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ machineId: "0123456789abcdef01234567" }),
    });

    expect(response.status).toBe(401);
  });

  test("POST /api/v1/purchases is mounted and refuses an anonymous caller", async ({
    apiStack,
  }) => {
    const response = await fetch(`${apiStack.apiUrl}/api/v1/purchases`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ vendor: "Costco" }),
    });

    expect(response.status).toBe(401);
  });

  test("an unknown /api/v1 route is a 404, not a tRPC error", async ({
    apiStack,
  }) => {
    const response = await fetch(`${apiStack.apiUrl}/api/v1/nope`);

    expect(response.status).toBe(404);
  });

  test("tRPC still serves the root, so the web app is unaffected", async ({
    apiStack,
  }) => {
    const response = await fetch(`${apiStack.apiUrl}/system.version`);

    expect(response.status).toBe(200);
    expect(await response.json()).toHaveProperty("result");
  });
});
