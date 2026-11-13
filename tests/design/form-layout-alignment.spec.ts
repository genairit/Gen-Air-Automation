import { randomUUID } from "node:crypto";
import type { Locator, Page } from "@playwright/test";
import { seedTaskScenario } from "../../src/api/seed-data.ts";
import { test, expect } from "../../src/fixtures/test.fixture.ts";
import { HTTP_METHODS } from "../../src/constants/http.constant.ts";
import { findCardByTitle } from "../../src/pages/card.component.ts";
import { buildTaskRoute } from "../../src/utilities/route.utility.ts";
import { findFieldContainer } from "../../src/pages/field.component.ts";
import { createCustomerFormPage } from "../../src/pages/customers.page.ts";
import { PROJECT_TYPE_NAMES } from "../../src/constants/domain.constant.ts";
import { createProjectFormPage } from "../../src/pages/project-form.page.ts";

const WIDTHS = [2048, 1280, 390] as const;
const EPSILON = 3;
type Bounds = NonNullable<Awaited<ReturnType<Locator["boundingBox"]>>>;

const bounds = async (locator: Locator): Promise<Bounds> => {
  const value = await locator.boundingBox();
  if (!value) throw new Error("Expected visible card bounds");
  return value;
};
const sameRow = (first: Bounds, second: Bounds) => {
  expect(Math.abs(first.y - second.y)).toBeLessThanOrEqual(EPSILON);
  expect(Math.min(first.x + first.width, second.x + second.width)).toBeLessThanOrEqual(
    Math.max(first.x, second.x) + EPSILON,
  );
};
const stacked = (first: Bounds, second: Bounds) => {
  expect(second.y).toBeGreaterThanOrEqual(first.y + first.height - EPSILON);
  expect(Math.abs(first.width - second.width)).toBeLessThanOrEqual(EPSILON);
};
const noOrphanRow = async (fields: Locator[]) => {
  const rectangles = await Promise.all(fields.map(bounds));
  const rowCounts = rectangles.reduce<number[]>((counts, rectangle, index) => {
    const rowStart = rectangles.findIndex(other => Math.abs(other.y - rectangle.y) <= EPSILON);
    return rowStart === index
      ? [...counts, rectangles.filter(other => Math.abs(other.y - rectangle.y) <= EPSILON).length]
      : counts;
  }, []);
  expect(rowCounts.length).toBeGreaterThan(0);
  expect(
    rowCounts.every(count => count === 1) || rowCounts.every(count => count > 1),
    JSON.stringify({ rowCounts, coordinates: rectangles.map(rectangle => rectangle.y) }),
  ).toBe(true);
};
const fitsViewport = async (page: Page) => {
  const geometry = await page.evaluate(() => ({
    width: window.innerWidth,
    scrollWidth: document.documentElement.scrollWidth,
    direction: getComputedStyle(document.body).direction,
  }));
  expect(geometry.direction).toBe("rtl");
  expect(geometry.scrollWidth).toBeLessThanOrEqual(geometry.width);
};
const screenshot = async (page: Page, name: string, width: number) =>
  page.screenshot({ path: test.info().outputPath(`${name}-${width}.png`), fullPage: true });

test("new customer cards align as rows, then existing contact search spans the row", async ({
  page,
  api,
}) => {
  const contactName = `איש קשר תצוגה ${randomUUID()}`;
  const created = await api.send(HTTP_METHODS.POST, "/contact-directory", {
    name: contactName,
    phone: "+12025550123",
  });
  expect(created.status()).toBe(201);
  const form = createCustomerFormPage(page);
  await form.goto();
  const identity = form.identityCard;
  const picker = findCardByTitle(page, "בחר איש קשר קיים");
  const manual = form.contactCard;
  const payment = findCardByTitle(page, "תנאי תשלום כברירת מחדל");
  const summary = form.summaryCard;

  for (const width of WIDTHS) {
    await page.setViewportSize({ width, height: 900 });
    await expect(identity).toBeVisible();
    await expect(picker).toBeVisible();
    await expect(manual).toBeVisible();
    await expect(summary).toBeVisible();
    await fitsViewport(page);
    const [identityRect, pickerRect, manualRect, paymentRect, summaryRect] = await Promise.all([
      bounds(identity),
      bounds(picker),
      bounds(manual),
      bounds(payment),
      bounds(summary),
    ]);
    expect(identityRect.y + identityRect.height).toBeLessThanOrEqual(pickerRect.y + EPSILON);
    if (width === 2048) sameRow(pickerRect, manualRect);
    else stacked(pickerRect, manualRect);
    if (width === 2048) sameRow(paymentRect, summaryRect);
    else stacked(paymentRect, summaryRect);
    await noOrphanRow(
      ["סוג הלקוח", "שם הלקוח", "ח.פ / ת.פ / ת.ז", "כתובת"].map(label =>
        findFieldContainer(identity, label),
      ),
    );
    await noOrphanRow(
      ["שם איש הקשר", "טלפון", "דוא״ל"].map(label => findFieldContainer(manual, label)),
    );
    await noOrphanRow(
      ["מזהה Priority", "נוצר ע״י", "סטטוס סנכרון"].map(label =>
        summary.getByText(label, { exact: true }).locator("xpath=.."),
      ),
    );
    await screenshot(page, "new-customer-empty-contact", width);
  }

  await page.getByPlaceholder("שם, טלפון או דוא״ל").fill(contactName);
  await picker.getByRole("button", { name: `בחר ${contactName}` }).click();
  await expect(manual).toHaveCount(0);
  for (const width of WIDTHS) {
    await page.setViewportSize({ width, height: 900 });
    await fitsViewport(page);
    const [identityRect, pickerRect] = await Promise.all([bounds(identity), bounds(picker)]);
    expect(Math.abs(pickerRect.width - identityRect.width)).toBeLessThanOrEqual(EPSILON);
    await screenshot(page, "new-customer-selected-contact", width);
  }
});

test("new project directory contacts and property details share a row only when space permits", async ({
  page,
}) => {
  const form = createProjectFormPage(page);
  await form.goto();
  await page.getByText(PROJECT_TYPE_NAMES.PRIVATE_CLIENT, { exact: true }).click();
  const contacts = findCardByTitle(page, "אנשי קשר לפרויקט");
  const property = findCardByTitle(page, "פרטי הנכס");
  await expect(property.getByPlaceholder("לדוגמה: 7")).toBeVisible();
  for (const width of WIDTHS) {
    await page.setViewportSize({ width, height: 900 });
    await fitsViewport(page);
    const [contactsRect, propertyRect] = await Promise.all([bounds(contacts), bounds(property)]);
    if (width === 2048) sameRow(contactsRect, propertyRect);
    else stacked(contactsRect, propertyRect);
    await screenshot(page, "new-project-with-property", width);
  }
  await expect(page.getByPlaceholder("שם, טלפון או דוא״ל")).toBeVisible();
});

test("task urgency remains a compact full-width strip above details", async ({ page, api }) => {
  const { task } = await seedTaskScenario(api);
  await page.goto(buildTaskRoute(task.id));
  const urgency = findCardByTitle(page, "משימה רגילה");
  const details = findCardByTitle(page, "פרטי המשימה");
  for (const width of WIDTHS) {
    await page.setViewportSize({ width, height: 900 });
    await fitsViewport(page);
    const [urgencyRect, detailsRect] = await Promise.all([bounds(urgency), bounds(details)]);
    expect(urgencyRect.y + urgencyRect.height).toBeLessThanOrEqual(detailsRect.y + EPSILON);
    expect(Math.abs(urgencyRect.width - detailsRect.width)).toBeLessThanOrEqual(EPSILON);
    expect(urgencyRect.height).toBeLessThan(200);
    await screenshot(page, "task-urgency", width);
  }
  await expect(page.getByRole("button", { name: "סמן כדחופה…" })).toBeVisible();
});
