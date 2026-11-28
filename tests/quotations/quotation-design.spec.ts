import {
  quotationBox,
  expectSameQuotationRow,
  captureQuotationScreenshot,
  expectQuotationWithinViewport,
} from "../../src/utilities/quotation-layout.utility.ts";

import { createQuotation } from "../../src/api/quotation.api.ts";
import { test, expect } from "../../src/fixtures/test.fixture.ts";
import { QUOTATION } from "../../src/constants/quotation.constant.ts";
import { createQuotationPage } from "../../src/pages/quotation.page.ts";
import { seedQuotationDesign } from "../../src/api/quotation-design-fixture.ts";
import { openWorkspaceTab } from "../../src/pages/project-workspace.component.ts";
import { setQuotationCountFixture } from "../../src/environment/quotation-fixtures.ts";

test("project quotations show the customer and order status in a responsive grid", async ({
  page,
  api,
}, testInfo) => {
  const { quotation, customer, project } = await seedQuotationDesign(api);
  const order = await createQuotation(api, customer.id, project.id);
  await setQuotationCountFixture(order.id, QUOTATION.STATUS.APPROVED);
  await page.setViewportSize({ width: 1440, height: 1100 });
  await page.goto(`/projects/${project.id}`);
  await openWorkspaceTab(page, "quotations");
  const tab = page.getByRole("region", { name: "הצעות מחיר", exact: true });
  const draftCard = tab.getByRole("region", { name: new RegExp(quotation.number) });
  const orderCard = tab.getByRole("region", { name: new RegExp(order.number) });
  await expect(tab.getByRole("heading")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "הצעת מחיר חדשה", exact: true })).toBeVisible();
  await expect(draftCard.getByText("טיוטה", { exact: true })).toBeVisible();
  await expect(orderCard.getByText("הזמנה", { exact: true })).toBeVisible();
  await expect(draftCard).toContainText(/₪[\d,]+\.\d{2}/);
  await expect(draftCard.locator("time")).toHaveAttribute("datetime", /^\d{4}-\d{2}-\d{2}T/);
  await expect(draftCard.locator("time")).toContainText("עודכן");
  const number = await quotationBox(draftCard.getByText(quotation.number, { exact: true }));
  const client = await quotationBox(draftCard.getByText(customer.name, { exact: true }));
  expect(client.y).toBeGreaterThanOrEqual(number.y + number.height - 1);
  await expectSameQuotationRow([draftCard, orderCard]);
  await captureQuotationScreenshot(page, testInfo.outputPath("project-quotations-desktop.png"));
  await page.setViewportSize({ width: 390, height: 1100 });
  await expectQuotationWithinViewport(page, [draftCard, orderCard]);
  const draft = await quotationBox(draftCard);
  const approved = await quotationBox(orderCard);
  expect(Math.abs(draft.x - approved.x)).toBeLessThanOrEqual(1);
  expect(Math.abs(draft.y - approved.y)).toBeGreaterThanOrEqual(
    Math.min(draft.height, approved.height),
  );
  await captureQuotationScreenshot(page, testInfo.outputPath("project-quotations-mobile.png"));
});

test("loading the next project quotation page keeps distinct records for the same customer", async ({
  page,
  api,
}) => {
  const { quotation, customer, project } = await seedQuotationDesign(api);
  const quotations = [quotation];
  for (let index = 0; index < 20; index++) {
    quotations.push(await createQuotation(api, customer.id, project.id));
  }
  await page.goto(`/projects/${project.id}`);
  await openWorkspaceTab(page, "quotations");
  const tab = page.getByRole("region", { name: "הצעות מחיר", exact: true });
  await expect(tab.getByRole("region")).toHaveCount(20);
  await tab.getByRole("button", { name: "טען עוד הצעות", exact: true }).click();
  await expect(tab.getByRole("region")).toHaveCount(quotations.length);
  for (const record of quotations)
    await expect(tab.getByRole("button", { name: new RegExp(record.number) })).toHaveCount(1);
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
  for (const name of ["לקוח *", "פרויקט *", "סוכן מכירות (אופציונלי)", "תאריך", "הנחה %"])
    await expect(quote.field(name)).toBeVisible();
  await details.click();
  for (const section of quotation.sections)
    for (const item of section.items) await expect(table).toContainText(item.sku);
  const parent = quotation.sections[0]!.items[0]!;
  const linked = quotation.sections[0]!.items.find(item => item.parentItemId === parent.id)!;
  await quote.openItem(parent.description);
  await expect(quote.field("מיקום").first()).toHaveValue(parent.location);
  await quote.openItem(linked.description);
  await expect(quote.field("בקר עבור יחידה")).toContainText(parent.location || parent.sku);
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
