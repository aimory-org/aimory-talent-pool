import { test, expect } from "@playwright/test";
import type { Page, Locator } from "@playwright/test";
import { getResultsTotal, waitForResultsSettled } from "../utils/dashboard";

// The slide-in detail panel. Assertions must be scoped here because the
// dashboard's FiltersPanel (still rendered behind the panel) uses several
// identical labels - "Certifications", "Clearance", "Status", etc.
function detailPanel(page: Page): Locator {
  return page.locator("div.fixed.inset-y-0.right-0");
}

async function openFirstProfile(page: Page) {
  await page.goto("/");
  await waitForResultsSettled(page);
  const total = await getResultsTotal(page);
  test.skip(total === 0, "No candidates in this environment to view");
  await page.locator("table tbody tr").first().click();
  await expect(detailPanel(page).getByText("Profile Details")).toBeVisible();
}

test("opening a candidate row shows the profile detail panel with core sections", async ({
  page,
}) => {
  await openFirstProfile(page);
  const panel = detailPanel(page);

  // Section headers are always rendered regardless of which fields a given
  // candidate happens to have populated, so they're a stable smoke check
  // independent of the real (variable) underlying data.
  await expect(panel.getByText("Contact Information")).toBeVisible();
  await expect(panel.getByText("Professional Details")).toBeVisible();
  await expect(panel.getByText("Work History")).toBeVisible();
  await expect(panel.getByText("Skills & Expertise")).toBeVisible();
  await expect(
    panel.getByRole("heading", { name: "Certifications" }),
  ).toBeVisible();
  await expect(panel.getByText("Clearance", { exact: true })).toBeVisible();
});

test("closing the profile panel returns to the dashboard", async ({ page }) => {
  await openFirstProfile(page);

  // The panel's close (X) button has no accessible name, so close via the
  // dark backdrop. Click low on the page - the sticky nav header (z-50)
  // overlaps the backdrop (z-40) at the top and intercepts clicks there.
  const viewport = page.viewportSize();
  await page
    .locator("div.fixed.inset-0.bg-black\\/60")
    .click({ position: { x: 10, y: (viewport?.height ?? 700) - 50 } });
  await expect(detailPanel(page).getByText("Profile Details")).not.toBeVisible();
});

test("resume link generates a presigned URL and opens the resume view", async ({
  page,
}) => {
  await openFirstProfile(page);

  const resumeButton = detailPanel(page).getByRole("button", {
    name: /view original resume/i,
  });
  test.skip(
    !(await resumeButton.isVisible().catch(() => false)),
    "First candidate has no resume key in this environment",
  );

  await resumeButton.click();
  await expect(
    page.getByRole("button", { name: /back to profile/i }),
  ).toBeVisible({ timeout: 15_000 });
});
