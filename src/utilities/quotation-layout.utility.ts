import { expect, type Locator, type Page } from "@playwright/test";

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
