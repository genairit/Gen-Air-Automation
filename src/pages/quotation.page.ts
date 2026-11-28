import { expect } from "@playwright/test";
import type { Page } from "@playwright/test";
import { selectMuiOption } from "./mui-select.component.ts";
import { HTTP_METHODS } from "../constants/http.constant.ts";
import { LIFECYCLE_COPY } from "../constants/quotation-lifecycle.constant.ts";

export const createQuotationPage = (page: Page) => {
  const button = (name: string) => page.getByRole("button", { name, exact: true });
  const field = (name: string) =>
    page
      .getByLabel(name, { exact: true })
      .or(page.getByRole("combobox", { name, exact: true }))
      .or(page.getByRole("textbox", { name, exact: true }))
      .or(page.getByRole("spinbutton", { name, exact: true }));
  const entitySearch = (name: string) =>
    page.getByRole("dialog", { name, exact: true }).getByRole("combobox", { name, exact: true });
  const saved = async (action: () => Promise<unknown>) => {
    const response = page.waitForResponse(
      response =>
        /\/quotation\/[\w-]+$/.test(new URL(response.url()).pathname) &&
        response.request().method() === HTTP_METHODS.PUT,
    );
    await action();
    expect((await response).status()).toBe(200);
    await expect(page.getByRole("alert")).toHaveCount(0);
    await expect(page.getByText("יש להמתין לשמירה מוצלחת לפני בדיקה ואישור.")).toHaveCount(0);
  };
  const fill = (name: string, value: string, index = 0) =>
    saved(() => field(name).nth(index).fill(value));
  const select = (name: string, value: string, index = 0) =>
    saved(() => selectMuiOption(page, field(name).nth(index), value));
  const addBrandTab = async (brand: string) => {
    await button("חברות").click();
    await saved(() => selectMuiOption(page, field("הוספת חברה"), brand));
  };
  const addSystem = async (brand: string, system: string, title = "") => {
    await button("+ הוספת מערכת").click();
    const form = page.getByRole("form", { name: "הוספת מערכת", exact: true });
    await selectMuiOption(page, form.getByRole("combobox", { name: "חברה", exact: true }), brand);
    if (brand)
      await selectMuiOption(
        page,
        form.getByRole("combobox", { name: "סוג מערכת", exact: true }),
        system,
      );
    await form.getByRole("textbox", { name: "כותרת מערכת", exact: true }).fill(title);
    await saved(() => form.getByRole("button", { name: "הוספה", exact: true }).click());
  };
  const showDetails = async () => {
    const details = page.getByRole("button", { name: /פרטי הצעה/ });
    if ((await details.getAttribute("aria-expanded")) === "false") await details.click();
  };
  const openItem = async (description: string, index = 0) => {
    const item = page
      .getByRole("button", { name: "עריכת פריט " + description, exact: true })
      .nth(index);
    if ((await item.getAttribute("aria-expanded")) === "false") await item.click();
  };
  const chooseEntity = async (name: string, label: string) => {
    await field(name).click();
    await entitySearch(name).fill(label);
    await page.getByRole("option", { name: label, exact: true }).click();
  };
  const selectEntity = (name: string, label: string) => saved(() => chooseEntity(name, label));
  const add = async (sku: string, index = 0) => {
    await field("חיפוש פריט בקטלוג").nth(index).fill(sku);
    await saved(() => page.getByRole("button").filter({ hasText: sku }).click());
  };
  const amount = (label: string) =>
    page.getByText(label, { exact: true }).locator("..").locator("b");
  const transition = async (name: string) => {
    const response = page.waitForResponse(
      response =>
        response.url().endsWith("/review") && response.request().method() === HTTP_METHODS.POST,
    );
    await button(name).click();
    expect((await response).status()).toBe(201);
    await expect(page.getByRole("alert")).toHaveCount(0);
  };
  const returnToEditing = async (): Promise<void> => {
    await button(LIFECYCLE_COPY.RETURN).click();
    const dialog = page.getByRole("dialog", { name: LIFECYCLE_COPY.RETURN, exact: true });
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText("היסטוריית המסמך תישמר");
    const response = page.waitForResponse(
      (response): boolean =>
        response.url().endsWith("/review") && response.request().method() === HTTP_METHODS.POST,
    );
    await dialog.getByRole("button", { name: LIFECYCLE_COPY.CONFIRM_RETURN, exact: true }).click();
    expect((await response).status()).toBe(201);
    await expect(dialog).toHaveCount(0);
    await expect(button(LIFECYCLE_COPY.RETURN)).toHaveCount(0);
    await expect(page.getByRole("alert")).toHaveCount(0);
  };
  const acknowledge = async () => {
    for (const checkbox of await page.getByRole("checkbox").all()) {
      if (await checkbox.isChecked()) {
        continue;
      }

      const response = page.waitForResponse(
        response =>
          response.url().endsWith("/warnings") && response.request().method() === HTTP_METHODS.POST,
      );
      await checkbox.click();
      expect((await response).status()).toBe(201);
      await expect(checkbox).toBeChecked();
    }
  };
  return {
    page,
    button,
    field,
    entitySearch,
    saved,
    fill,
    select,
    addBrandTab,
    addSystem,
    showDetails,
    openItem,
    chooseEntity,
    selectEntity,
    add,
    amount,
    transition,
    returnToEditing,
    acknowledge,
    goto: (id: string) => page.goto(`/quotations/${id}`),
  };
};
