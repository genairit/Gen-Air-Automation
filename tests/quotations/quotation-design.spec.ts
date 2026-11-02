import {
  quotationBox,
  expectSameQuotationRow,
  captureQuotationScreenshot,
  expectQuotationWithinViewport,
} from "../../src/utilities/quotation-layout.utility.ts";

import { seedCustomer } from "../../src/api/seed-data.ts";
import { test, expect } from "../../src/fixtures/test.fixture.ts";
import { HTTP_METHODS } from "../../src/constants/http.constant.ts";
import { QUOTATION } from "../../src/constants/quotation.constant.ts";
import { createQuotationPage } from "../../src/pages/quotation.page.ts";
import { seedQuotationDesign } from "../../src/api/quotation-design-fixture.ts";
import { createQuotation, quotationDocument } from "../../src/api/quotation.api.ts";
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
  expect((await quotationBox(page.getByLabel(SEARCH, { exact: true }))).height).toBe(56);
  const box = await quotationBox(row);
  expect(box.height).toBeLessThanOrEqual(90);
  const cells = row.locator(":scope > *");
  await expect(cells).toHaveCount(6);
  await expectSameQuotationRow(await cells.all());
  const tabs = page.locator("button[aria-pressed]");
  await expect(tabs).toHaveCount(4);
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
  for (const name of ["הכל 23", "טיוטה 21", "בבדיקה 1", "אושרה 1"]) {
    await expect(page.getByRole("button", { name, exact: true })).toBeVisible();
  }
  await expect(rowButtons(page)).toHaveCount(20);
  await page.getByRole("button", { name: "טען עוד הצעות", exact: true }).click();
  await expect(rowButtons(page)).toHaveCount(23);
  await expect(page.getByRole("button", { name: "הכל 23", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "טיוטה 21", exact: true }).click();
  await expect(rowButtons(page)).toHaveCount(20);
  await expect(page.getByRole("button", { name: "בבדיקה 1", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "אושרה 1", exact: true }).click();
  await expect(rowButtons(page)).toHaveCount(1);
  await expect(page.getByRole("button", { name: "הכל 23", exact: true })).toBeVisible();
  await page.getByLabel(SEARCH, { exact: true }).fill(`${owner.name} missing`);
  await expect(page.getByText("לא נמצאו הצעות מחיר", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "הכל 0", exact: true })).toBeVisible();
});

test("populated quotation matches metadata, grouped compact equipment, linked controls, payments and review layout", async ({
  page,
  api,
}, testInfo) => {
  await page.setViewportSize({ width: 1440, height: 1100 });
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  const { quotation } = await seedQuotationDesign(api);
  const quote = createQuotationPage(page);
  const quantityLabel = `כמות (${quotation.sections[0]!.items[0]!.unit})`;
  await quote.goto(quotation.id);
  const back = page.getByRole("link", { name: /חזרה להצעות מחיר/ });
  await expect(back).toBeVisible();
  await expect(back).toHaveAttribute("href", "/quotations");
  const metadata = ["לקוח *", "פרויקט (אופציונלי)", "חברת מיזוג", "הנחה %", "תאריך"].map(
    quote.field,
  );
  const boxes = await expectSameQuotationRow(metadata);
  for (const box of boxes) {
    expect(box.height).toBe(52);
  }
  await expect(page.locator("details")).toHaveCount(0);
  for (const [index, box] of boxes.entries()) {
    if (index > 0) {
      expect(box.x + box.width).toBeLessThanOrEqual(boxes[index - 1]!.x);
    }
  }
  const backBox = await quotationBox(back);
  expect(backBox.y).toBeLessThan(boxes[0]!.y);
  expect((await quotationBox(quote.button("+ סינגלים"))).height).toBe(34);
  await expect(quote.button("+ סינגלים")).toHaveCSS("background-color", "rgb(245, 245, 247)");
  expect((await quotationBox(quote.button("מחיקת מערכת").first())).height).toBe(34);
  await expect(quote.field("כותרת מערכת / קומה")).toHaveCount(2);
  await expect(quote.field("כותרת מערכת / קומה").nth(0)).toHaveValue("קומה 3");
  await expect(quote.field("כותרת מערכת / קומה").nth(1)).toHaveValue("חדר עבודה");
  await expect(
    page.getByRole("heading", { name: "מעגלים ודיאגנוסטיקה", exact: true }),
  ).toBeVisible();
  await expect(page.getByText(/מעגל קומה 3 · A · יחס/)).toBeVisible();
  await expect(page.getByText("פנים 55700 BTU", { exact: true })).toBeVisible();
  await expect(page.getByText("מעבה 52886 BTU", { exact: true })).toBeVisible();
  await expectSameQuotationRow([
    quote.field("מיקום").first(),
    quote.field("תיאור בהצעה").first(),
    quote.field(quantityLabel).first(),
    quote.field("מחיר ליחידה").first(),
  ]);
  await expect(page.getByText("מחיר ליחידה (בהצעה)", { exact: true })).toHaveCount(5);
  await expect(page.getByText("מטרים", { exact: true })).toBeVisible();
  await expect(page.getByText("פריט", { exact: true })).toHaveCount(2);
  const numericCaption = page.getByText("כמות", { exact: true }).first();
  expect((await quotationBox(numericCaption)).y).toBeGreaterThan(
    (await quotationBox(quote.field(quantityLabel).first())).y,
  );
  const quantity = await quotationBox(quote.field(quantityLabel).first());
  expect(quantity.height).toBeLessThanOrEqual(42);
  await expect(quote.field("בקר עבור יחידה")).toHaveCount(2);
  await expect(quote.field("תיאור בקר בהצעה")).toHaveCount(2);
  await expect(quote.field(quantityLabel)).toHaveCount(6);
  await expect(
    page.getByText(`2 ${quotation.sections[0]!.items[0]!.unit} ·`, { exact: false }),
  ).toBeVisible();
  const parentBox = await quotationBox(quote.field("תיאור בהצעה").first());
  const controlBox = await quotationBox(quote.field("תיאור בקר בהצעה").first());
  const nextParentBox = await quotationBox(quote.field("תיאור בהצעה").nth(1));
  expect(controlBox.y).toBeGreaterThan(parentBox.y);
  expect(controlBox.y).toBeLessThan(nextParentBox.y);
  await expect(page.getByRole("button").filter({ hasText: "E-SMD-63" })).toHaveCount(0);
  const chips = page.getByRole("radiogroup", { name: "תנאי תשלום", exact: true });
  await expect(chips.getByRole("radio")).toHaveCount(5);
  await expect(chips.getByRole("radio", { name: "תשלום מראש", exact: true })).toBeChecked();
  await expect(quote.field("אחוז מהסכום")).toHaveCount(3);
  await expectSameQuotationRow([
    quote.field("אחוז מהסכום").first(),
    quote.field("מועד / אבן דרך").first(),
  ]);
  const scheduleBox = await quotationBox(quote.field("אחוז מהסכום").first());
  expect(scheduleBox.height).toBeLessThanOrEqual(42);
  await captureQuotationScreenshot(page, testInfo.outputPath("quotation-editor-desktop-1440.png"));
  await page.setViewportSize({ width: 390, height: 1100 });
  await expectQuotationWithinViewport(page, [
    ...metadata,
    quote.field(quantityLabel).first(),
    quote.field("מחיר ליחידה").first(),
    quote.field("תיאור בקר בהצעה").first(),
    quote.field("בקר עבור יחידה").first(),
    chips,
  ]);
  await captureQuotationScreenshot(page, testInfo.outputPath("quotation-editor-mobile-390.png"));
  await expect(quote.field("תיאור בהצעה").first()).toHaveValue(
    quotation.sections[0]!.items[0]!.description,
  );
  await page.setViewportSize({ width: 1440, height: 1100 });
  const parent = quotation.sections[0]!.items[0]!;
  const otherParent = quotation.sections[0]!.items[1]!;
  const linked = quotation.sections[0]!.items.find(line => line.parentItemId === parent.id)!;
  await quote.select("בקר עבור יחידה", otherParent.id);
  const reassigned = await quotationDocument(
    await api.send(HTTP_METHODS.GET, `/quotation/${quotation.id}`),
  );
  expect(reassigned.sections[0]!.items.find(line => line.id === linked.id)).toMatchObject({
    parentItemId: otherParent.id,
    quantity: otherParent.quantity,
  });
  const movedControl = await quotationBox(quote.field("תיאור בקר בהצעה").first());
  const movedParent = await quotationBox(quote.field("תיאור בהצעה").nth(1));
  const followingParent = await quotationBox(quote.field("תיאור בהצעה").nth(2));
  expect(movedControl.y).toBeGreaterThan(movedParent.y);
  expect(movedControl.y).toBeLessThan(followingParent.y);
  await quote.select("בקר עבור יחידה", parent.id);
  const restored = await quotationDocument(
    await api.send(HTTP_METHODS.GET, `/quotation/${quotation.id}`),
  );
  expect(restored.sections[0]!.items.find(line => line.id === linked.id)).toMatchObject({
    parentItemId: parent.id,
    quantity: parent.quantity,
  });
  expect((await quotationBox(quote.field("חיפוש פריט בקטלוג").first())).height).toBe(44);
  await quote.field("חיפוש פריט בקטלוג").first().focus();
  await expect(page.getByRole("button").filter({ hasText: "E-SMD-63" })).toBeVisible();
  await quote.field("חיפוש פריט בקטלוג").first().fill("E-SMD-63");
  await expect(page.getByRole("button").filter({ hasText: "E-SMD-63" })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("button").filter({ hasText: "E-SMD-63" })).toHaveCount(0);
  await quote.transition("סיימתי, לבדיקה");
  await expect(page.getByRole("heading", { name: "סיכום לבדיקה", exact: true })).toBeVisible();
  expect((await quotationBox(quote.button("אישור ההצעה"))).height).toBe(52);
  const groups = page.getByRole("columnheader").filter({ hasText: /קומה 3|חדר עבודה/ });
  await expect(groups).toHaveCount(2);
  await expect(
    page.getByRole("table").getByRole("cell", { name: "E-SMD-63", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("table").getByRole("cell", { name: "AC123", exact: true }),
  ).toBeVisible();
  const warning = page
    .getByText("חריג — מאושר במפורש", { exact: true })
    .locator("..")
    .locator("..")
    .first();
  expect((await quotationBox(warning)).y).toBeLessThan(
    (await quotationBox(page.getByRole("table"))).y,
  );
  const warningCheckbox = warning.getByRole("checkbox");
  const warningText = warning.locator("span").first();
  const checkboxBox = await quotationBox(warningCheckbox);
  expect(checkboxBox.x + checkboxBox.width).toBeLessThanOrEqual(
    (await quotationBox(warningText)).x,
  );
  await expect(page.getByRole("progressbar", { name: "התקדמות בדיקת הצעה" })).toHaveCount(1);
  const summaryCard = page
    .getByRole("heading", { name: "בדיקה ואישור", exact: true })
    .locator("..");
  await expect(summaryCard.getByRole("checkbox")).toHaveCount(0);
  await captureQuotationScreenshot(page, testInfo.outputPath("quotation-review-desktop-1440.png"));
  await page.setViewportSize({ width: 390, height: 1100 });
  await expectQuotationWithinViewport(page, [
    back,
    quote.button("עריכה"),
    quote.button("אישור ההצעה"),
  ]);
  const mobileCheckboxBox = await quotationBox(warningCheckbox);
  expect(mobileCheckboxBox.x + mobileCheckboxBox.width).toBeLessThanOrEqual(
    (await quotationBox(warningText)).x,
  );
  await captureQuotationScreenshot(page, testInfo.outputPath("quotation-review-mobile-390.png"));
  expect(errors).toEqual([]);
});
