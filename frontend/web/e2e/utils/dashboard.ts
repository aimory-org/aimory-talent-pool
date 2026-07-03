import { expect } from "@playwright/test";
import type { Page } from "@playwright/test";

/** Reads the "Showing X–Y of N candidates" total from the results header. */
export async function getResultsTotal(page: Page): Promise<number> {
  const text = await page
    .getByText(/of\s+[\d,]+\s+candidates?/)
    .first()
    .textContent();
  const match = text?.match(/of\s+([\d,]+)\s+candidates?/);
  if (!match) throw new Error(`Could not parse results total from: "${text}"`);
  return parseInt(match[1].replace(/,/g, ""), 10);
}

export async function waitForResultsSettled(page: Page) {
  await page.getByText(/Loading candidates/).waitFor({ state: "hidden" }).catch(() => {});
}

/**
 * Polls until the results total equals the expected count. Needed for
 * assertions after clearing a filter/search: the click triggers an async
 * refetch, and a one-shot read races it (reads the stale filtered count).
 */
export async function expectResultsTotal(page: Page, expected: number) {
  await expect
    .poll(() => getResultsTotal(page), { timeout: 30_000 })
    .toBe(expected);
}
