import { test, expect } from "@playwright/test";
import { expectResultsTotal, getResultsTotal, waitForResultsSettled } from "../utils/dashboard";
import { filterGroup, selectFirstFilterOption } from "../utils/filters";

test.describe("search", () => {
  test("searching by candidate name narrows results and clearing restores them", async ({
    page,
  }) => {
    await page.goto("/");
    await waitForResultsSettled(page);

    const baselineTotal = await getResultsTotal(page);
    test.skip(baselineTotal === 0, "No candidates in this environment to search for");

    const firstRow = page.locator("table tbody tr").first();
    const candidateName = (
      await firstRow.locator("p.font-medium").first().textContent()
    )?.trim();
    expect(candidateName).toBeTruthy();

    const searchBox = page.getByPlaceholder(
      "Search by name, tags, and resume content...",
    );
    await searchBox.fill(candidateName!);
    // Wait for the actual search API response, not just the loading spinner -
    // the spinner may not have rendered yet when we check, and clicking
    // "Clear search" while the (slow) search request is still in flight
    // exercises a response-ordering race rather than the search feature.
    const searchResponse = page.waitForResponse(
      (r) => r.url().includes("/talents?") && r.url().includes("search="),
    );
    await searchBox.press("Enter");
    await searchResponse;
    await waitForResultsSettled(page);

    const searchedTotal = await getResultsTotal(page);
    expect(searchedTotal).toBeGreaterThan(0);
    expect(searchedTotal).toBeLessThanOrEqual(baselineTotal);
    await expect(page.locator("table tbody")).toContainText(candidateName!);

    // Clear via the dedicated clear-search button
    await page.getByLabel("Clear search").click();
    await waitForResultsSettled(page);
    await expectResultsTotal(page, baselineTotal);
  });
});

test.describe("filters", () => {
  test("applying a status filter narrows results; clear all restores them", async ({
    page,
  }) => {
    await page.goto("/");
    await waitForResultsSettled(page);

    const baselineTotal = await getResultsTotal(page);
    test.skip(baselineTotal === 0, "No candidates in this environment to filter");

    await selectFirstFilterOption(page, "Status");
    await waitForResultsSettled(page);

    const filteredTotal = await getResultsTotal(page);
    expect(filteredTotal).toBeLessThanOrEqual(baselineTotal);
    await expect(page.getByText(/\d+ filters? active/)).toBeVisible();

    // "Clear all (N)" in the filters panel header - distinct from the
    // "Clear all filters" button the empty state renders.
    await page.getByRole("button", { name: /clear all \(/i }).click();
    await waitForResultsSettled(page);
    await expectResultsTotal(page, baselineTotal);
  });

  test("applying a skill filter narrows results; removing it restores them", async ({
    page,
  }) => {
    await page.goto("/");
    await waitForResultsSettled(page);

    const baselineTotal = await getResultsTotal(page);
    test.skip(baselineTotal === 0, "No candidates in this environment to filter");

    const skill = await selectFirstFilterOption(page, "Skills");
    await waitForResultsSettled(page);

    const filteredTotal = await getResultsTotal(page);
    expect(filteredTotal).toBeLessThanOrEqual(baselineTotal);

    // Skill filters render as removable pills rather than a single-value
    // select, so they're cleared via their own "x" rather than clearFilterSelection.
    await filterGroup(page, "Skills")
      .getByText(skill, { exact: true })
      .locator("xpath=..")
      .getByRole("button")
      .click();
    await waitForResultsSettled(page);
    await expectResultsTotal(page, baselineTotal);
  });
});
