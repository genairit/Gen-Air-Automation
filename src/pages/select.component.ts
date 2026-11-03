import { expect } from "@playwright/test";
import type { Page, Locator } from "@playwright/test";

export const selectOption = async (
  page: Page,
  combobox: Locator,
  optionLabel: string,
): Promise<void> => {
  await combobox.click();
  const listboxId = await combobox.getAttribute("aria-controls");

  if (!listboxId) {
    throw new Error("The combobox must identify its controlled listbox");
  }

  const listbox = page.getByRole("listbox").and(page.locator(`[id=${JSON.stringify(listboxId)}]`));
  await expect(listbox).toBeVisible();
  const option = listbox.getByRole("option", { name: optionLabel, exact: true });

  await expect
    .poll(async () => {
      if (await option.count()) {
        return true;
      }

      await listbox.evaluate(element => {
        element.scrollTo(0, element.scrollHeight);
      });

      return false;
    })
    .toBe(true);

  await option.click();
};
