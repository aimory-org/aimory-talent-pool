import { expect } from "@playwright/test";
import type { Page, Locator } from "@playwright/test";

/**
 * FiltersPanel/ProfileDetailPanel use a custom SearchableSelect combobox with
 * no ARIA roles (no role="combobox"/"listbox"/"option") - see
 * src/components/ui/searchable-select.tsx. Each filter control is a
 * `<div className="space-y-2"><Label>...</Label><SearchableSelect/></div>`,
 * so scoping by the label text is the only stable way to target one filter
 * without colliding with identical option text elsewhere on the page (e.g.
 * a status name that also appears as a table badge).
 */
function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function filterGroup(page: Page, label: string): Locator {
  // Several labels (Skills, Certifications, Industry, Tags) append a
  // "(N)" count once a value is selected, e.g. "Skills" -> "Skills (1)" -
  // match either form without also matching a longer label like
  // "Skills & Expertise" (ProfileDetailPanel) via the anchored $.
  // The trailing \s* matters: these labels render as `Skills{" "}` in JSX,
  // so the text node is "Skills " even with no count.
  const labelPattern = new RegExp(
    `^${escapeRegExp(label)}\\s*(\\(\\d+\\))?\\s*$`,
  );
  return page
    .locator("div.space-y-2")
    .filter({ has: page.getByText(labelPattern) });
}

async function openDropdown(group: Locator) {
  await group.locator("div.cursor-pointer").first().click();
}

/** Selects an option by exact visible text within the given filter group. */
export async function selectFilterOption(
  page: Page,
  label: string,
  optionText: string,
) {
  const group = filterGroup(page, label);
  await openDropdown(group);
  await group.locator("div.absolute").getByText(optionText, { exact: true }).click();
}

/**
 * Opens the dropdown and selects whichever option is listed first -
 * avoids hardcoding a specific domain value (status name, skill, etc.)
 * that may not exist in a given environment's real data.
 */
export async function selectFirstFilterOption(
  page: Page,
  label: string,
): Promise<string> {
  const group = filterGroup(page, label);
  await openDropdown(group);
  const firstOption = group.locator("div.absolute > div").first();
  // Lookup-backed dropdowns show a "No matches" placeholder row until the
  // async lookups API responds - wait for a real option before clicking.
  await expect(firstOption).not.toHaveText("No matches", { timeout: 15_000 });
  const text = (await firstOption.textContent())?.trim() ?? "";
  await firstOption.click();
  return text;
}

export async function clearFilterSelection(page: Page, label: string) {
  await filterGroup(page, label).getByLabel("Clear selection").click();
}
