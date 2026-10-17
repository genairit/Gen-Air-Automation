import type { Page, Locator } from "@playwright/test";

export const selectOption = async (
  page: Page,
  combobox: Locator,
  optionLabel: string,
): Promise<void> => {
  await combobox.click();
  await page.getByRole("option", { name: optionLabel, exact: true }).click();
};
