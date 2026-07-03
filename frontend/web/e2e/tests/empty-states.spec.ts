import { test, expect } from "@playwright/test";
import { expectResultsTotal, getResultsTotal, waitForResultsSettled } from "../utils/dashboard";

test("an impossible search shows the empty state, and clearing it restores results", async ({
  page,
}) => {
  await page.goto("/");
  await waitForResultsSettled(page);

  const baselineTotal = await getResultsTotal(page);
  test.skip(baselineTotal === 0, "No candidates in this environment to begin with");

  const searchBox = page.getByPlaceholder(
    "Search by name, tags, and resume content...",
  );
  // A random token guaranteed not to match any real candidate.
  await searchBox.fill("zzznonexistentcandidatequery9f3k2");
  await searchBox.press("Enter");
  await waitForResultsSettled(page);

  await expect(page.getByText("No candidates found")).toBeVisible();
  await expect(
    page.getByText("Try adjusting your filters to see more results"),
  ).toBeVisible();

  await page.getByRole("button", { name: /clear all filters/i }).click();
  await waitForResultsSettled(page);
  await expectResultsTotal(page, baselineTotal);
});
