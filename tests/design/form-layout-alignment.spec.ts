import {
  contactSearchInput,
  additionalContactSection,
} from "../../src/pages/contact-search.page.ts";

import type { Locator, Page } from "@playwright/test";
import { seedTaskScenario } from "../../src/api/seed-data.ts";
import { test, expect } from "../../src/fixtures/test.fixture.ts";
import { findCardByTitle } from "../../src/pages/card.component.ts";
import { buildTaskRoute } from "../../src/utilities/route.utility.ts";
import { findFieldContainer } from "../../src/pages/field.component.ts";
import { createCustomerFormPage } from "../../src/pages/customers.page.ts";
import { PROJECT_TYPE_NAMES } from "../../src/constants/domain.constant.ts";
import { createProjectFormPage } from "../../src/pages/project-form.page.ts";
import { openWorkspaceTab } from "../../src/pages/project-workspace.component.ts";

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

test("new customer own-details cards retain compact rows without a directory picker", async ({
  page,
}) => {
  const form = createCustomerFormPage(page);
  await form.goto();
  const identity = form.identityCard;
  const ownDetails = form.contactCard;
  const payment = findCardByTitle(page, "תנאי תשלום כברירת מחדל");
  const summary = form.summaryCard;
  await expect(page.getByPlaceholder("שם, טלפון או דוא״ל")).toHaveCount(0);
  for (const width of WIDTHS) {
    await page.setViewportSize({ width, height: 900 });
    await expect(identity).toBeVisible();
    await expect(ownDetails).toBeVisible();
    await expect(summary).toBeVisible();
    await fitsViewport(page);
    const [identityRect, ownRect, paymentRect, summaryRect] = await Promise.all([
      bounds(identity),
      bounds(ownDetails),
      bounds(payment),
      bounds(summary),
    ]);
    expect(identityRect.y + identityRect.height).toBeLessThanOrEqual(ownRect.y + EPSILON);
    const assertPaymentPlacement = width === 2048 ? sameRow : stacked;
    assertPaymentPlacement(paymentRect, summaryRect);
    await noOrphanRow(
      ["סוג הלקוח", "שם הלקוח", "ח.פ / ת.פ / ת.ז", "כתובת"].map(label =>
        findFieldContainer(identity, label),
      ),
    );
    await noOrphanRow(
      ["טלפון ראשי של הלקוח", "דוא״ל של הלקוח"].map(label => findFieldContainer(ownDetails, label)),
    );
    await noOrphanRow(
      ["מזהה Priority", "נוצר ע״י", "סטטוס סנכרון"].map(label =>
        summary.getByText(label, { exact: true }).locator("xpath=.."),
      ),
    );
    await screenshot(page, "new-customer-own-details", width);
  }
});

test("new project shows the selected work area, preserves fields, and keeps actions reachable", async ({
  page,
}) => {
  const form = createProjectFormPage(page);
  await form.goto();
  await form.chooseProjectType(PROJECT_TYPE_NAMES.PRIVATE_CLIENT);
  const floor = page.getByPlaceholder("לדוגמה: 7");
  for (const width of WIDTHS) {
    await page.setViewportSize({ width, height: 900 });
    await openWorkspaceTab(page, "technical");
    await expect(floor).toBeVisible();
    await floor.fill("3");
    await openWorkspaceTab(page, "people");
    await expect(floor).toBeHidden();
    await expect(contactSearchInput(additionalContactSection(page))).toBeVisible();
    await openWorkspaceTab(page, "technical");
    await expect(floor).toHaveValue("3");
    await fitsViewport(page);
    await expect(form.createButton).toBeVisible();
    await expect(form.createButton).toBeInViewport();
    const cancel = page.locator("footer").getByRole("button", { name: "ביטול", exact: true });
    await expect
      .poll(() =>
        cancel.evaluate(element => {
          const box = element.getBoundingClientRect();
          const hit = document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2);
          return element.contains(hit);
        }),
      )
      .toBe(true);
    await screenshot(page, "new-project-technical", width);
  }
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
