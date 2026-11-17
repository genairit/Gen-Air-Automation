import { expect, type Locator, type Page } from "@playwright/test";
import { STACK_TIMEOUTS } from "../constants/environment.constant.ts";

const QUOTATION_ROW_CENTER_TOLERANCE = 16;

export const quotationBox = async (locator: Locator) => {
  await expect(locator).toBeVisible();
  const box = await locator.boundingBox();
  if (!box) {
    throw new Error("Visible quotation element has no layout box");
  }

  return box;
};

const centerSpread = (boxes: Awaited<ReturnType<typeof quotationBox>>[]) => {
  const centers = boxes.map(box => box.y + box.height / 2);
  return Math.max(...centers) - Math.min(...centers);
};

export const expectSameQuotationRow = async (locators: Locator[]) => {
  await expect(async () => {
    const boxes = await Promise.all(locators.map(quotationBox));
    expect(centerSpread(boxes)).toBeLessThanOrEqual(QUOTATION_ROW_CENTER_TOLERANCE);
  }).toPass({ timeout: STACK_TIMEOUTS.EXPECT_MS });

  const boxes = await Promise.all(locators.map(quotationBox));
  expect(centerSpread(boxes)).toBeLessThanOrEqual(QUOTATION_ROW_CENTER_TOLERANCE);
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
