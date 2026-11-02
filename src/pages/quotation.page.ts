import { expect } from "@playwright/test";
import type { Page } from "@playwright/test";
import { HTTP_METHODS } from "../constants/http.constant.ts";

export const createQuotationPage = (page: Page) => {
  const button = (name: string) => page.getByRole("button", { name, exact: true });
  const field = (name: string) =>
    page
      .getByLabel(name, { exact: true })
      .or(page.getByRole("combobox", { name, exact: true }))
      .or(page.getByRole("textbox", { name, exact: true }))
      .or(page.getByRole("spinbutton", { name, exact: true }));
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
    saved(() => field(name).nth(index).selectOption(value));
  const chooseEntity = async (name: string, label: string) => {
    await field(name).fill(label);
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
    saved,
    fill,
    select,
    chooseEntity,
    selectEntity,
    add,
    amount,
    transition,
    acknowledge,
    goto: (id: string) => page.goto(`/quotations/${id}`),
  };
};
