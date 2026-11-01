import { clerk, setupClerkTestingToken } from "@clerk/testing/playwright";
import type { Page } from "@playwright/test";
import { test, expect, requireTestUser } from "../fixtures.ts";

/**
 * The claim the offline story rests on: a retried submit must return the FIRST
 * purchase, not create a second one. The repository test proves the unique
 * index and the service test proves the re-read path; only this one proves the
 * two HTTP requests a phone actually sends come back as one document, over the
 * REST surface a native client actually calls.
 *
 * Needs a real Clerk session — every purchase procedure is `orgProtectedProcedure`.
 */
requireTestUser();

/** tRPC's standalone adapter, unbatched: POST the input as the whole body. */
const mutate = (
  apiUrl: string,
  token: string,
  path: string,
  input: unknown,
): Promise<Response> =>
  fetch(`${apiUrl}/${path}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(input),
  });

/** A query with no input must send no `input` param at all, not "undefined". */
const query = (
  apiUrl: string,
  token: string,
  path: string,
  input?: unknown,
): Promise<Response> => {
  const search =
    input === undefined
      ? ""
      : `?input=${encodeURIComponent(JSON.stringify(input))}`;
  return fetch(`${apiUrl}/${path}${search}`, {
    headers: { authorization: `Bearer ${token}` },
  });
};

const dataOf = async <T>(response: Response): Promise<T> => {
  const body = (await response.json()) as {
    result?: { data?: T };
    error?: { message?: string };
  };
  if (!response.ok || !body.result) {
    throw new Error(
      `${response.status} ${body.error?.message ?? "no result in response"}`,
    );
  }
  return body.result.data as T;
};

/**
 * Signs the test user in and returns a session token. Every purchase procedure
 * is `orgProtectedProcedure`, so there is no useful request to make without one.
 */
const signIn = async (page: Page, apiUrl: string): Promise<string> => {
  await setupClerkTestingToken({ page });
  await page.goto("/");
  await clerk.loaded({ page });
  await clerk.signIn({
    page,
    signInParams: {
      strategy: "password",
      identifier: process.env.E2E_CLERK_USER_EMAIL!,
      password: process.env.E2E_CLERK_USER_PASSWORD!,
    },
  });

  // `globalThis` rather than `window`: this closure is serialized into the page,
  // but it is TYPE-CHECKED here, where the DOM lib is not loaded.
  const token = await page.evaluate(async () => {
    const clerkGlobal = (
      globalThis as unknown as {
        Clerk?: { session?: { getToken(): Promise<string | null> } };
      }
    ).Clerk;
    return (await clerkGlobal?.session?.getToken()) ?? null;
  });
  expect(token).toBeTruthy();

  // Every data procedure needs an org claim. A fresh test user has no business
  // yet, and creating one here would leave a tenant behind in a shared Clerk
  // instance — so skip rather than fabricate.
  const probe = await query(apiUrl, token!, "machines.list");
  test.skip(
    probe.status === 403,
    "The E2E Clerk user needs an active organization",
  );
  return token!;
};

test("a repeated purchase submit stores exactly one purchase", async ({
  page,
  apiStack,
}) => {
  const token = await signIn(page, apiStack.apiUrl);
  const product = await dataOf<{ id: string }>(
    await mutate(apiStack.apiUrl, token, "products.create", {
      name: `E2E Cola ${crypto.randomUUID().slice(0, 8)}`,
      category: "drinks",
      defaultPriceCents: 175,
    }),
  );

  // One `body` string reused for both posts, as an outbox would resend it:
  // proving idempotency over bytes, not merely over equivalent JSON.
  const body = JSON.stringify({
    purchasedAt: new Date().toISOString(),
    vendor: "E2E Mart",
    lines: [{ productId: product.id, units: 24, totalCostCents: 1299 }],
    clientRequestId: `e2e-${crypto.randomUUID()}`,
  });
  const post = (): Promise<Response> =>
    fetch(`${apiStack.apiUrl}/api/v1/purchases`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${token}`,
      },
      body,
    });

  const first = await post();
  expect(first.status).toBe(200);
  const firstPurchase = (await first.json()) as { id: string };

  // The retry. Byte-identical `body`, as a retried REST submit from a phone
  // actually sends it.
  const retry = await post();
  // 200 with the original, never a 409: a client cannot act on a conflict, so
  // it would either drop the purchase or retry forever.
  expect(retry.status).toBe(200);
  const retried = (await retry.json()) as { id: string };
  expect(retried.id).toBe(firstPurchase.id);

  // No cleanup: this worker's stack runs on its own in-memory MongoDB, which
  // goes away with the worker. Only the Clerk organization is shared, and
  // nothing here touches it.
});
