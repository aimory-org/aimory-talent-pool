import { test, expect } from "@playwright/test";
import { expectResultsTotal, getResultsTotal, waitForResultsSettled } from "../utils/dashboard";
import { filterGroup, selectFirstFilterOption } from "../utils/filters";

async function openAndReadOptions(page: import("@playwright/test").Page, label: string) {
  const group = filterGroup(page, label);
  await group.locator("div.cursor-pointer").first().click();
  // Lookup data (cities, skills, ...) loads asynchronously after the page
  // renders; until it arrives the dropdown shows a single "No matches" row.
  // Poll briefly so a slow lookups API doesn't read as an empty dropdown.
  const optionRows = group.locator("div.absolute > div");
  await expect
    .poll(async () => (await optionRows.allTextContents()).filter((t) => t !== "No matches").length, {
      timeout: 15_000,
    })
    .toBeGreaterThan(0)
    .catch(() => {});
  const options = (await optionRows.allTextContents()).filter(
    (t) => t !== "No matches",
  );
  await page.keyboard.press("Escape");
  return options;
}

test("selecting a state narrows the city dropdown to that state", async ({
  page,
}) => {
  await page.goto("/");
  await waitForResultsSettled(page);

  const cityOptionsBefore = await openAndReadOptions(page, "City");
  test.skip(
    cityOptionsBefore.length === 0,
    "No cities in this environment's lookup data",
  );
  // Before any state is chosen, cities are labelled "City, ST".
  expect(cityOptionsBefore.every((o) => o.includes(","))).toBe(true);

  await selectFirstFilterOption(page, "State");

  const cityOptionsAfter = await openAndReadOptions(page, "City");
  await page.keyboard.press("Escape");

  // Once a state is selected, FiltersPanel drops the ", ST" suffix and
  // restricts the list to that state's cities (see FiltersPanel.tsx).
  if (cityOptionsAfter.length > 0) {
    expect(cityOptionsAfter.every((o) => !o.includes(","))).toBe(true);
  }
  expect(cityOptionsAfter.length).toBeLessThanOrEqual(cityOptionsBefore.length);
});

test("combining clearance and skill filters narrows results further than either alone", async ({
  page,
}) => {
  await page.goto("/");
  await waitForResultsSettled(page);

  const baselineTotal = await getResultsTotal(page);
  test.skip(baselineTotal === 0, "No candidates in this environment to filter");

  await selectFirstFilterOption(page, "Clearance");
  await waitForResultsSettled(page);
  const afterClearance = await getResultsTotal(page);
  expect(afterClearance).toBeLessThanOrEqual(baselineTotal);

  await selectFirstFilterOption(page, "Skills");
  await waitForResultsSettled(page);
  const afterBoth = await getResultsTotal(page);

  expect(afterBoth).toBeLessThanOrEqual(afterClearance);
  await expect(page.getByText("2 filters active")).toBeVisible();

  await page.getByRole("button", { name: /clear all \(/i }).click();
  await waitForResultsSettled(page);
  await expectResultsTotal(page, baselineTotal);
});
