import type { Locator, Page } from "@playwright/test";

/** Select a Material UI menu item by its stable value, not its translated display text. */
export const selectMuiOption = async (
  page: Page,
  select: Locator,
  value: string,
): Promise<void> => {
  await select.click();
  await page.locator(`[role="option"][data-value="${value}"]`).click();
};
