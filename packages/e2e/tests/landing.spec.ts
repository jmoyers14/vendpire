import { test, expect, requireClerkKeys } from "../fixtures.ts";

requireClerkKeys();

test("signed-out visitors see the landing screen", async ({ page }) => {
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: /vendpire/i }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Sign in" })).toBeVisible();
});
