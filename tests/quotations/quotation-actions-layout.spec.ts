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
  test(`quotation header actions wrap cleanly with top-left trash at ${width}px`, async ({
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
    const clone = editor.button("צור העתק לחברה אחרת");
    const pdf = editor.button("ייצוא PDF");
    const cancel = editor.button("ביטול הצעה");
    const trash = editor.button("מחיקת ההצעה");
    const actions = clone.locator("..");
    for (const action of [clone, pdf, cancel, trash]) {
      await expect(action).toBeVisible();
    }
    await expect(page.locator("span[data-active]")).toHaveCount(0);
    const heading = await visibleBox(
      page.getByRole("heading", { name: quotation.number, exact: true }),
    );
    const trashBox = await visibleBox(trash);
    expect(trashBox.x).toBeLessThan(heading.x);
    expect(trashBox.width).toBeGreaterThanOrEqual(44);
    const layout = await actions.evaluate(element => {
      const row = element.getBoundingClientRect();
      return {
        wrap: getComputedStyle(element).flexWrap,
        allInside: [...element.children].every(child => {
          if (child.querySelector('button[aria-label="מחיקת ההצעה"]')) {
            return true;
          }
          const box = child.getBoundingClientRect();
          return box.left >= row.left - 1 && box.right <= row.right + 1;
        }),
      };
    });
    expect(layout.wrap).toBe("wrap");
    expect(layout.allInside).toBe(true);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await page.screenshot({
      path: test.info().outputPath(`quotation-actions-${width}.png`),
      fullPage: true,
    });
  });
}
