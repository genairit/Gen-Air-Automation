import { expect, type Locator, type Page } from "@playwright/test";

export const QUOTATION_DELETE_HORIZONTAL_INSET = 42;

export const quotationBox = async (locator: Locator) => {
  await expect(locator).toBeVisible();
  const box = await locator.boundingBox();
  if (!box) {
    throw new Error("Visible quotation element has no layout box");
  }

  return box;
};

export const expectSameQuotationRow = async (locators: Locator[]) => {
  const boxes = await Promise.all(locators.map(quotationBox));
  const centers = boxes.map(box => box.y + box.height / 2);
  expect(Math.max(...centers) - Math.min(...centers)).toBeLessThanOrEqual(16);
  return boxes;
};

export const expectQuotationWithinViewport = async (page: Page, locators: Locator[]) => {
  const width = page.viewportSize()?.width;
  if (!width) {
    throw new Error("Quotation visual checks need a fixed viewport");
  }

  for (const locator of locators) {
    const box = await quotationBox(locator);
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(width + 1);
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
};

export const captureQuotationScreenshot = async (page: Page, path: string) => {
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path, fullPage: true });
};

export const expectQuotationDeleteFooter = async (page: Page, remove: Locator) => {
  const totals = page.getByText("סה״כ כולל מע״מ", { exact: true }).locator("../..");
  const review = page.getByRole("heading", { name: "בדיקה ואישור", exact: true }).locator("..");
  const [totalsBox, reviewBox] = await expectSameQuotationRow([totals, review]);
  const card = await quotationBox(remove.locator(".."));
  const action = await quotationBox(remove);
  const left = Math.min(totalsBox.x, reviewBox.x);
  const right = Math.max(totalsBox.x + totalsBox.width, reviewBox.x + reviewBox.width);
  const bottom = Math.max(totalsBox.y + totalsBox.height, reviewBox.y + reviewBox.height);
  expect(Math.abs(totalsBox.width - reviewBox.width)).toBeLessThanOrEqual(1);
  expect(totalsBox.x).toBeGreaterThan(reviewBox.x);
  expect(Math.abs(card.x - left)).toBeLessThanOrEqual(1);
  expect(Math.abs(card.width - (right - left))).toBeLessThanOrEqual(1);
  expect(Math.abs(card.y - bottom - 24)).toBeLessThanOrEqual(1);
  expect(
    Math.abs(action.width - (card.width - QUOTATION_DELETE_HORIZONTAL_INSET)),
  ).toBeLessThanOrEqual(1);
  expect(Math.abs(action.x - card.x - 20)).toBeLessThanOrEqual(1);
  return totals.locator("..");
};
