import { clerk, setupClerkTestingToken } from "@clerk/testing/playwright";
import { test, expect, requireTestUser } from "../fixtures.ts";

requireTestUser();

test("the Settings tab opens the organization profile", async ({ page }) => {
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
  await page.goto("/settings");

  await expect(page.getByRole("heading", { name: "Settings" })).toBeVisible();

  await expect(page.getByRole("link", { name: "Settings" })).toHaveAttribute(
    "aria-current",
    "page",
  );

  // Clerk owns everything below the title; assert only that it mounted.
  await expect(page.getByRole("button", { name: /members/i })).toBeVisible();
});
