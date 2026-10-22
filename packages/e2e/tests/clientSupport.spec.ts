import { expect } from "@playwright/test";
import { test } from "../fixtures.ts";

// A real floor, so the interesting verdicts are reachable. Arrives at the api
// as the STRING "43" — which is half of what this spec proves.
test.use({ apiEnv: { IOS_MINIMUM_BUILD: "43", IOS_RECOMMENDED_BUILD: "50" } });

interface ClientSupportBody {
  updateRequirement: "none" | "recommended" | "required";
  updateUrl: string;
}

test.describe("GET /api/v1/client-support", () => {
  test("answers with no Authorization header at all", async ({ apiStack }) => {
    const response = await fetch(
      `${apiStack.apiUrl}/api/v1/client-support?platform=ios&build=42`,
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      updateRequirement: "required",
    });
  });

  test("survives the floor arriving as a string", async ({ apiStack }) => {
    const current = await fetch(
      `${apiStack.apiUrl}/api/v1/client-support?platform=ios&build=50`,
    );
    const nudged = await fetch(
      `${apiStack.apiUrl}/api/v1/client-support?platform=ios&build=45`,
    );
    const currentBody = (await current.json()) as ClientSupportBody;
    const nudgedBody = (await nudged.json()) as ClientSupportBody;

    expect(currentBody.updateRequirement).toBe("none");
    expect(nudgedBody.updateRequirement).toBe("recommended");
  });

  test("hands back somewhere to send people", async ({ apiStack }) => {
    const response = await fetch(
      `${apiStack.apiUrl}/api/v1/client-support?platform=ios&build=42`,
    );
    const body = (await response.json()) as ClientSupportBody;

    expect(body.updateUrl).toMatch(/^https?:\/\//);
  });
});

test.describe("the 426 backstop", () => {
  test("refuses a too-old build on a gated path, off the real wire", async ({
    apiStack,
  }) => {
    const response = await fetch(`${apiStack.apiUrl}/api/v1/visits/latest`, {
      headers: { "X-Vendpire-Client": "ios/42" },
    });

    expect(response.status).toBe(426);
    expect(await response.json()).toMatchObject({
      error: { code: "UPGRADE_REQUIRED" },
    });
  });

  test("never refuses client-support itself, or the wall explains nothing", async ({
    apiStack,
  }) => {
    const response = await fetch(
      `${apiStack.apiUrl}/api/v1/client-support?platform=ios&build=42`,
      { headers: { "X-Vendpire-Client": "ios/42" } },
    );

    expect(response.status).toBe(200);
  });

  test("gives a current build 401, not 426 — the floor is not an auth error", async ({
    apiStack,
  }) => {
    const response = await fetch(`${apiStack.apiUrl}/api/v1/visits/latest`, {
      headers: { "X-Vendpire-Client": "ios/50" },
    });

    expect(response.status).toBe(401);
  });

  test("passes through a request with no client header — the web app sends none", async ({
    apiStack,
  }) => {
    const response = await fetch(`${apiStack.apiUrl}/api/v1/visits/latest`);

    expect(response.status).toBe(401);
  });
});
