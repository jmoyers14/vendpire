import { clerk, setupClerkTestingToken } from "@clerk/testing/playwright";
import { test, expect, requireTestUser } from "../fixtures.ts";

requireTestUser();

test("a signed-in user reaches the signed-in area", async ({ page }) => {
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
  await page.goto("/");

  // Fresh test users land on the create-business gate; users already in an
  // org land on the dashboard. Either proves the signed-in wiring end to end.
  await expect(
    page
      .getByRole("heading", { name: "Create your business" })
      .or(page.getByRole("heading", { name: "Dashboard" })),
  ).toBeVisible();

  // The signed-out landing must be gone.
  await expect(page.getByRole("button", { name: "Sign in" })).toHaveCount(0);
});
