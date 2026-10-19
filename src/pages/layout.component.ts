import type { Page, Locator } from "@playwright/test";

export const findMainContent = (page: Page): Locator => page.locator("main");

export const readHorizontalOverflow = (page: Page): Promise<number> =>
  page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);

export const readBoundingBox = async (locator: Locator) => {
  const box = await locator.boundingBox();

  if (box === null) {
    throw new Error(`${locator} is not rendered`);
  }

  return box;
};

export const isWithinViewportWidth = async (page: Page, locator: Locator): Promise<boolean> => {
  const box = await readBoundingBox(locator);
  const viewportWidth = page.viewportSize()?.width ?? 0;
  const startsInside = box.x >= 0;
  const endsInside = box.x + box.width <= viewportWidth;

  return startsInside && endsInside;
};
