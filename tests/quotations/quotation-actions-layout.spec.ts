import type { Locator } from "@playwright/test";
import { seedCustomer } from "../../src/api/seed-data.ts";
import { createQuotation } from "../../src/api/quotation.api.ts";
import { test, expect } from "../../src/fixtures/test.fixture.ts";
import { createQuotationPage } from "../../src/pages/quotation.page.ts";

const WIDTHS = [1440, 900, 390] as const;

const visibleBox = async (locator: Locator) => {
  await expect(locator).toBeVisible();
  const box = await locator.boundingBox();
  if (!box) {
    throw new Error("Expected a visible quotation control");
  }
  return box;
};

for (const width of WIDTHS) {
  test(`quotation actions stay together and status steps remain separate at ${width}px`, async ({
    api,
    page,
  }) => {
    const customer = await seedCustomer(api);
    const quotation = await createQuotation(api, customer.id);
    const editor = createQuotationPage(page);
    await page.setViewportSize({ width, height: 900 });
    await editor.goto(quotation.id);

    const exportButton = editor.button("ייצוא PDF");
    const cancelButton = page.getByRole("button", { name: "ביטול הצעה", exact: true });
    const steps = page.locator("span[data-active]");
    const exportBox = await visibleBox(exportButton);
    const cancelBox = await visibleBox(cancelButton);
    await expect(steps).toHaveCount(3);
    const firstStepBox = await visibleBox(steps.first());

    expect(Math.abs(exportBox.y - cancelBox.y)).toBeLessThanOrEqual(2);
    expect(exportBox.x).toBeGreaterThan(cancelBox.x);
    expect(firstStepBox.y).toBeGreaterThanOrEqual(exportBox.y + exportBox.height);
    expect(firstStepBox.y).toBeGreaterThanOrEqual(cancelBox.y + cancelBox.height);
    const geometry = await page.evaluate(() => ({
      viewport: innerWidth,
      content: document.documentElement.scrollWidth,
    }));
    expect(geometry.content).toBeLessThanOrEqual(geometry.viewport);
    expect(
      await page
        .locator("main")
        .last()
        .evaluate(element => getComputedStyle(element).direction),
    ).toBe("rtl");

    await exportButton.focus();
    await page.keyboard.press("Tab");
    await expect(cancelButton).toBeFocused();
    if (width !== 900) {
      await page.screenshot({
        path: test.info().outputPath(`quotation-actions-${width}.png`),
        fullPage: true,
      });
    }
  });
}
