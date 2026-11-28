import {
  quotationBox,
  expectSameQuotationRow,
  captureQuotationScreenshot,
  expectQuotationWithinViewport,
} from "../../src/utilities/quotation-layout.utility.ts";

import { seedCustomer } from "../../src/api/seed-data.ts";
import { createQuotation } from "../../src/api/quotation.api.ts";
import { test, expect } from "../../src/fixtures/test.fixture.ts";
import { QUOTATION } from "../../src/constants/quotation.constant.ts";
import { createQuotationPage } from "../../src/pages/quotation.page.ts";
import { seedQuotationDesign } from "../../src/api/quotation-design-fixture.ts";
import { setQuotationCountFixture } from "../../src/environment/quotation-fixtures.ts";

const SEARCH = "חיפוש לפי מספר, לקוח, פרויקט או חברה";
const rowButtons = (page: Parameters<typeof createQuotationPage>[0]) =>
  page.getByRole("button").filter({ hasText: /\d{4}-\d{6}/ });

// Dimensions come from the supplied updated prototype; screenshots are also inspected against it.
test("quotation list keeps dense six-column rows and inline toolbar while tab counts exceed the page", async ({
  page,
  api,
}, testInfo) => {
  await page.setViewportSize({ width: 1440, height: 1100 });
  const { quotation, customer } = await seedQuotationDesign(api);
  await page.goto("/quotations");
  await page.getByLabel(SEARCH, { exact: true }).fill(customer.name);
  const row = rowButtons(page).filter({ hasText: quotation.number });
  await expect(row).toBeVisible();
  await expect(row).toContainText(QUOTATION.BRAND);
  await expect(row).toContainText("טיוטה");
  await expect(row).toContainText(/₪[\d,]+\.\d{2}/);
  await expect(row).toContainText(/לפני|עכשיו/);
  expect(
    (await quotationBox(page.getByRole("button", { name: "הצעה חדשה", exact: true }))).height,
  ).toBe(52);
  expect(
    (
      await quotationBox(
        page
          .locator(".MuiInputBase-root")
          .filter({ has: page.getByLabel(SEARCH, { exact: true }) }),
      )
    ).height,
  ).toBe(38);
  const box = await quotationBox(row);
  expect(box.height).toBeLessThanOrEqual(90);
  const cells = row.locator(":scope > *");
  await expect(cells).toHaveCount(6);
  await expectSameQuotationRow(await cells.all());
  const tabs = page.getByRole("button", { name: /^(הכל|טיוטה|בבדיקה|הזמנה|מבוטלת) \d+$/ });
  await expect(tabs).toHaveCount(5);
  await expectSameQuotationRow([page.getByLabel(SEARCH, { exact: true }), tabs.first()]);
  await captureQuotationScreenshot(page, testInfo.outputPath("quotation-list-desktop-1440.png"));
  await page.setViewportSize({ width: 390, height: 1100 });
  await expectQuotationWithinViewport(page, [
    row,
    page.getByLabel(SEARCH, { exact: true }),
    ...(await tabs.all()),
  ]);
  await captureQuotationScreenshot(page, testInfo.outputPath("quotation-list-mobile-390.png"));
  expect(
    await row.evaluate(element =>
      [...element.children].every(cell => cell.scrollWidth <= cell.clientWidth + 1),
    ),
  ).toBe(true);
  await page.setViewportSize({ width: 1440, height: 1100 });
  const owner = await seedCustomer(api);
  for (const status of [
    ...Array.from({ length: 21 }, () => QUOTATION.STATUS.DRAFT),
    QUOTATION.STATUS.REVIEW,
    QUOTATION.STATUS.APPROVED,
  ]) {
    const item = await createQuotation(api, owner.id);
    await setQuotationCountFixture(item.id, status);
  }
  await page.getByLabel(SEARCH, { exact: true }).fill(owner.name);
  for (const name of ["הכל 23", "טיוטה 21", "בבדיקה 1", "הזמנה 1", "מבוטלת 0"]) {
    await expect(page.getByRole("button", { name, exact: true })).toBeVisible();
  }
  await expect(rowButtons(page)).toHaveCount(20);
  await page.getByRole("button", { name: "טען עוד הצעות", exact: true }).click();
  await expect(rowButtons(page)).toHaveCount(23);
  await expect(page.getByRole("button", { name: "הכל 23", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "טיוטה 21", exact: true }).click();
  await expect(rowButtons(page)).toHaveCount(20);
  await expect(page.getByRole("button", { name: "בבדיקה 1", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "הזמנה 1", exact: true }).click();
  await expect(rowButtons(page)).toHaveCount(1);
  await expect(page.getByRole("button", { name: "הכל 23", exact: true })).toBeVisible();
  await page.getByLabel(SEARCH, { exact: true }).fill(`${owner.name} missing`);
  await expect(page.getByText("לא נמצאו הצעות מחיר", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "הכל 0", exact: true })).toBeVisible();
});

test("quotation workspace keeps compact metadata, linked rows, payments and review readable on desktop and phone", async ({
  page,
  api,
}, testInfo) => {
  await page.setViewportSize({ width: 1800, height: 1100 });
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  const { quotation } = await seedQuotationDesign(api);
  const quote = createQuotationPage(page);
  await quote.goto(quotation.id);
  const table = page.getByRole("table", { name: "פריטי ההצעה", exact: true });
  const document = page.getByRole("article", { name: "מסמך ההצעה", exact: true });
  await expect(table).toBeVisible();
  await expect(document).toBeVisible();
  const details = page.getByRole("button", { name: /פרטי הצעה/ });
  await expect(details).toHaveAttribute("aria-expanded", "false");
  await quote.showDetails();
  for (const name of ["לקוח *", "פרויקט (אופציונלי)", "סוכן מכירות (אופציונלי)", "תאריך", "הנחה %"])
    await expect(quote.field(name)).toBeVisible();
  await details.click();
  for (const section of quotation.sections)
    for (const item of section.items) await expect(table).toContainText(item.sku);
  const parent = quotation.sections[0]!.items[0]!;
  const linked = quotation.sections[0]!.items.find(item => item.parentItemId === parent.id)!;
  await quote.openItem(parent.description);
  await expect(quote.field("מיקום").first()).toHaveValue(parent.location);
  await quote.openItem(linked.description);
  await expect(quote.field("בקר עבור יחידה")).toHaveValue(parent.id);
  const chips = page.getByRole("radiogroup", { name: "תנאי תשלום", exact: true });
  await expect(chips.getByRole("radio", { name: "לפי שלבי תשלום", exact: true })).toBeChecked();
  await expect(quote.field("אחוז מהסכום")).toHaveCount(3);
  await captureQuotationScreenshot(page, testInfo.outputPath("workspace-desktop.png"));
  await quote.transition("סיימתי, לבדיקה");
  await expect(table.getByRole("spinbutton")).toHaveCount(0);
  await expect(quote.button("עריכה")).toBeVisible();
  await expect(quote.button("אישור ההצעה")).toBeVisible();
  await page.setViewportSize({ width: 390, height: 1100 });
  await expect(page.getByRole("tab", { name: "פריטים", exact: true })).toBeVisible();
  await expect(table).toBeVisible();
  await page.getByRole("tab", { name: "מסמך", exact: true }).click();
  await expect(document).toBeVisible();
  expect(await page.evaluate(() => window.document.documentElement.scrollWidth <= innerWidth)).toBe(
    true,
  );
  await captureQuotationScreenshot(page, testInfo.outputPath("workspace-phone-document.png"));
  expect(errors).toEqual([]);
});
