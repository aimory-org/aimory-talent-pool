import { test, expect } from "@playwright/test";

// Proves the whole E2E pipeline works end-to-end: headless auth against the
// deployed dev environment (via auth.setup.ts) lands on the authenticated
// dashboard rather than the "Sign in with Microsoft" login page.
//
// Asserts on the "Talent Pool" nav link specifically (not just "Sign out",
// which AccessDeniedPanel also renders) so a VITE_ALLOWED_EMAIL_SUFFIXES
// mismatch for the test user shows up as a failure here instead of a false
// green.
test("authenticated user lands on the dashboard", async ({ page }) => {
  await page.goto("/");

  await expect(
    page.getByRole("button", { name: /sign in with microsoft/i }),
  ).not.toBeVisible();

  await expect(page.getByRole("link", { name: /talent pool/i })).toBeVisible();

  await expect(page.getByText(process.env.E2E_TEST_USER_EMAIL!)).toBeVisible();
});
