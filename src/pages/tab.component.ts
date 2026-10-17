import { escapeRegex } from "../utilities/regex.utility.ts";
import { expect, type Page, type Locator } from "@playwright/test";

const TAB_COUNT_SUFFIX = "\\(?(\\d+)\\)?$";

const TAB_COUNT_PATTERN = new RegExp(TAB_COUNT_SUFFIX);

const buildCountedTabName = (label: string) =>
  new RegExp(`^${escapeRegex(label)} ${TAB_COUNT_SUFFIX}`);

export const findTab = (scope: Page | Locator, name: string): Locator =>
  scope.getByRole("tab", { name, exact: true });

export const findCountedTab = (scope: Page | Locator, label: string): Locator =>
  scope.getByRole("tab", { name: buildCountedTabName(label) });

export const readTabCount = async (tab: Locator): Promise<number> => {
  const label = (await tab.textContent())?.trim() ?? "";
  const match = TAB_COUNT_PATTERN.exec(label);

  return Number(match?.[1] ?? 0);
};

export const expectTabSelected = (tab: Locator): Promise<void> =>
  expect(tab).toHaveAttribute("aria-selected", "true");
