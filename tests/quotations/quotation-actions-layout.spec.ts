import { randomUUID } from "node:crypto";
import type { Locator } from "@playwright/test";
import { seedCustomer } from "../../src/api/seed-data.ts";
import { test, expect } from "../../src/fixtures/test.fixture.ts";
import { QUOTATION } from "../../src/constants/quotation.constant.ts";
import { createQuotationPage } from "../../src/pages/quotation.page.ts";
import { createQuotation, quotationWrite, saveQuotation } from "../../src/api/quotation.api.ts";

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
    const initial = await createQuotation(api, customer.id);
    const quotation = await saveQuotation(api, initial.id, {
      ...quotationWrite(initial),
      brand: QUOTATION.BRAND,
      sections: [
        {
          id: randomUUID(),
          title: "Action layout",
          systemType: QUOTATION.SYSTEM.SINGLE,
          brand: QUOTATION.BRAND,
          items: [],
        },
      ],
    });
    const editor = createQuotationPage(page);
    await page.setViewportSize({ width, height: 900 });
    await editor.goto(quotation.id);

    const cloneButton = editor.button("צור העתק לחברה אחרת");
    const exportButton = editor.button("ייצוא PDF");
    const cancelButton = page.getByRole("button", { name: "ביטול הצעה", exact: true });
    const actions = cloneButton.locator("..");
    const steps = page.locator("span[data-active]");
    const cloneBox = await visibleBox(cloneButton);
    const exportBox = await visibleBox(exportButton);
    const cancelBox = await visibleBox(cancelButton);
    await expect(steps).toHaveCount(3);
    const firstStepBox = await visibleBox(steps.first());

    expect(cloneBox.y).toBeLessThanOrEqual(exportBox.y);
    if (width === 390) {
      expect(cloneBox.y).toBeLessThan(exportBox.y);
    }
    expect(Math.abs(exportBox.y - cancelBox.y)).toBeLessThanOrEqual(2);
    expect(exportBox.x).toBeGreaterThan(cancelBox.x);
    expect(firstStepBox.y).toBeGreaterThanOrEqual(exportBox.y + exportBox.height);
    expect(firstStepBox.y).toBeGreaterThanOrEqual(cancelBox.y + cancelBox.height);
    const geometry = await page.evaluate(() => ({
      viewport: innerWidth,
      content: document.documentElement.scrollWidth,
    }));
    expect(geometry.content).toBeLessThanOrEqual(geometry.viewport);
    const actionStyles = await actions.evaluate(element => {
      const style = getComputedStyle(element);
      const row = element.getBoundingClientRect();
      return {
        wrap: style.flexWrap,
        overflowX: style.overflowX,
        children: [...element.children].map(child => {
          const button = child as HTMLElement;
          const box = button.getBoundingClientRect();
          const buttonStyle = getComputedStyle(button);
          return {
            background: buttonStyle.backgroundColor,
            shadow: buttonStyle.boxShadow,
            inRow: box.left >= row.left - 1 && box.right <= row.right + 1,
          };
        }),
      };
    });
    expect(actionStyles.wrap).toBe("wrap");
    expect(actionStyles.overflowX).toBe("visible");
    expect(actionStyles.children).toHaveLength(3);
    for (const button of actionStyles.children) {
      expect(button.background).toBe("rgb(255, 255, 255)");
      expect(button.shadow).toBe("none");
      expect(button.inRow).toBe(true);
    }
    expect(
      await page
        .locator("main")
        .last()
        .evaluate(element => getComputedStyle(element).direction),
    ).toBe("rtl");

    await cloneButton.focus();
    await page.keyboard.press("Tab");
    await expect(exportButton).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(cancelButton).toBeFocused();
    for (const button of [cloneButton, exportButton, cancelButton]) {
      await button.hover();
      await expect(button).toHaveCSS("background-color", "rgb(248, 250, 252)");
      await expect(button).toHaveCSS("box-shadow", "none");
    }
    await page.screenshot({
      path: test.info().outputPath(`quotation-actions-${width}.png`),
      fullPage: true,
    });
  });
}
