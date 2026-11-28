import type { Page, Locator } from "@playwright/test";

export const createEstimateEditorPage = (page: Page) => {
  const table = page.getByRole("table", { name: "פריטים מהקטלוג לפי אזור", exact: true });
  const document = page.getByRole("article", { name: "תצוגה מקדימה של כתב הכמויות" });
  const itemRows = table.getByRole("row").filter({
    has: page.getByRole("combobox", { name: "בחירת פריט מהקטלוג", exact: true }),
  });
  const selectCatalogueItem = async (
    row: Locator,
    sku: string,
    description: string,
  ): Promise<void> => {
    const field = row.getByRole("combobox", { name: "בחירת פריט מהקטלוג", exact: true });
    await field.click();
    await page
      .getByRole("dialog", { name: "בחירת פריט מהקטלוג", exact: true })
      .getByRole("combobox")
      .fill(sku);
    await page.getByRole("option", { name: `${sku} · ${description}`, exact: true }).click();
  };
  return { table, document, itemRows, selectCatalogueItem };
};
