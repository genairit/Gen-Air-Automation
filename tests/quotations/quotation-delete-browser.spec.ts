import {
  quotationBox,
  expectSameQuotationRow,
  expectQuotationWithinViewport,
} from "../../src/utilities/quotation-layout.utility.ts";

import { test, expect } from "../../src/fixtures/test.fixture.ts";
import { HTTP_METHODS } from "../../src/constants/http.constant.ts";
import { USER_ROLES } from "../../src/constants/user-role.constant.ts";
import { TEST_USERS } from "../../src/constants/test-users.constant.ts";
import { createQuotationPage } from "../../src/pages/quotation.page.ts";
import { withRolePermissions } from "../../src/environment/role-permissions.ts";
import { seedQuotationForDeletion } from "../../src/api/quotation-delete-fixture.ts";
import { QUOTATION, QUOTATION_PERMISSIONS } from "../../src/constants/quotation.constant.ts";
import { quotationDocument, quotationWrite, saveQuotation } from "../../src/api/quotation.api.ts";

for (const status of Object.values(QUOTATION.STATUS)) {
  test(`delete card matches design and confirmed ${status} deletion returns to refreshed list`, async ({
    page,
    api,
  }, testInfo) => {
    const { quotation, customer } = await seedQuotationForDeletion(api, status);
    const quote = createQuotationPage(page);
    const deletions: string[] = [];
    page.on("request", request => {
      if (request.method() === HTTP_METHODS.DELETE) {
        deletions.push(request.url());
      }
    });
    await page.setViewportSize({ width: 1440, height: 1100 });
    await page.goto("/quotations");
    await quote.field("חיפוש לפי מספר, לקוח, פרויקט או חברה").fill(customer.name);
    await expect(page.getByRole("button", { name: "הכל 1", exact: true })).toBeVisible();
    await page.getByRole("button").filter({ hasText: quotation.number }).click();
    const remove = quote.button("מחיקת ההצעה");
    await expect(remove).toBeEnabled();
    expect((await quotationBox(remove)).height).toBe(44);
    await expect(remove).toHaveCSS("background-color", "rgb(245, 245, 247)");
    await expectSameQuotationRow([
      remove.locator(".."),
      page.getByText("סה״כ כולל מע״מ", { exact: true }).locator("../.."),
      page.getByRole("heading", { name: "בדיקה ואישור", exact: true }).locator(".."),
    ]);
    await remove.click();
    const confirm = quote.button("אישור מחיקת ההצעה");
    await expect(
      page.getByText(`למחוק את ${quotation.number}? אי אפשר לשחזר דרך האפליקציה.`, { exact: true }),
    ).toBeVisible();
    expect((await quotationBox(confirm)).height).toBe(38);
    await expect(confirm).toHaveCSS("background-color", "rgb(30, 32, 34)");
    expect(deletions).toEqual([]);
    await quote.button("ביטול").click();
    await expect(remove).toBeVisible();
    expect(
      (await quotationDocument(await api.send(HTTP_METHODS.GET, `/quotation/${quotation.id}`)))
        .version,
    ).toBe(quotation.version);
    await page.setViewportSize({ width: 390, height: 1100 });
    await expectQuotationWithinViewport(page, [remove]);
    await remove.click();
    await expectQuotationWithinViewport(page, [confirm, quote.button("ביטול")]);
    await confirm.scrollIntoViewIfNeeded();
    await page.screenshot({
      path: testInfo.outputPath(`delete-${status}-mobile.png`),
      fullPage: true,
    });
    const response = page.waitForResponse(
      response =>
        response.request().method() === HTTP_METHODS.DELETE &&
        response.url().endsWith(`/quotation/${quotation.id}`),
    );
    await confirm.click();
    expect((await response).status()).toBe(204);
    await expect(page).toHaveURL(/\/quotations$/);
    await expect(page.getByRole("button").filter({ hasText: quotation.number })).toHaveCount(0);
    await quote.field("חיפוש לפי מספר, לקוח, פרויקט או חברה").fill(customer.name);
    await expect(page.getByRole("button", { name: "הכל 0", exact: true })).toBeVisible();
    expect(deletions).toHaveLength(1);
    await quote.goto(quotation.id);
    await expect(page.getByRole("alert")).toBeVisible();
    await expect(remove).toHaveCount(0);
  });
}

test("failed delete keeps confirmation open, reload resolves actual stale version and retry succeeds", async ({
  page,
  api,
}) => {
  const { quotation } = await seedQuotationForDeletion(api, QUOTATION.STATUS.DRAFT);
  const quote = createQuotationPage(page);
  await quote.goto(quotation.id);
  await quote.button("מחיקת ההצעה").click();
  await saveQuotation(api, quotation.id, {
    ...quotationWrite(quotation),
    internalNotes: "Changed in another tab",
  });
  const conflict = page.waitForResponse(
    response => response.request().method() === HTTP_METHODS.DELETE,
  );
  await quote.button("אישור מחיקת ההצעה").click();
  expect((await conflict).status()).toBe(409);
  await expect(page).toHaveURL(new RegExp(`/quotations/${quotation.id}$`));
  await expect(page.getByRole("alert")).toBeVisible();
  await expect(quote.button("אישור מחיקת ההצעה")).toBeEnabled();
  await quote.button("טעינת גרסה מעודכנת").click();
  await expect(page.getByRole("alert")).toHaveCount(0);
  await expect(quote.field("הערות פנימיות (לא יופיעו ללקוח)")).toHaveValue(
    "Changed in another tab",
  );
  const success = page.waitForResponse(
    response => response.request().method() === HTTP_METHODS.DELETE,
  );
  await quote.button("אישור מחיקת ההצעה").click();
  expect((await success).status()).toBe(204);
  await expect(page).toHaveURL(/\/quotations$/);
});

test("read-only user cannot see deletion while delete-only grant works independently of editing", async ({
  api,
  openPageAs,
}) => {
  const { quotation } = await seedQuotationForDeletion(api, QUOTATION.STATUS.APPROVED);
  await withRolePermissions(USER_ROLES.ENGINEER, [QUOTATION_PERMISSIONS.READ], async () => {
    const page = await openPageAs(TEST_USERS[USER_ROLES.ENGINEER]);
    await page.goto(`/quotations/${quotation.id}`);
    await expect(page.getByText(quotation.number, { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "מחיקת ההצעה", exact: true })).toHaveCount(0);
  });
  await withRolePermissions(
    USER_ROLES.ENGINEER,
    [QUOTATION_PERMISSIONS.READ, QUOTATION_PERMISSIONS.DELETE],
    async () => {
      const page = await openPageAs(TEST_USERS[USER_ROLES.ENGINEER]);
      const quote = createQuotationPage(page);
      await quote.goto(quotation.id);
      await expect(quote.button("פתיחה לעריכה (אותו מזהה)")).toHaveCount(0);
      await quote.button("מחיקת ההצעה").click();
      const response = page.waitForResponse(
        response => response.request().method() === HTTP_METHODS.DELETE,
      );
      await quote.button("אישור מחיקת ההצעה").click();
      expect((await response).status()).toBe(204);
      await expect(page).toHaveURL(/\/quotations$/);
    },
  );
});

test("pending deletion disables confirmation and cancel and dispatches exactly one real request", async ({
  page,
  api,
}) => {
  const { quotation } = await seedQuotationForDeletion(api, QUOTATION.STATUS.DRAFT);
  const quote = createQuotationPage(page);
  const held = { release: () => {} };
  const ready = { release: () => {} };
  const gate = new Promise<void>(resolve => {
    held.release = resolve;
  });
  const reached = new Promise<void>(resolve => {
    ready.release = resolve;
  });
  const requests: string[] = [];
  await page.route(`**/quotation/${quotation.id}`, async route => {
    if (route.request().method() !== HTTP_METHODS.DELETE) {
      await route.continue();
      return;
    }
    requests.push(route.request().url());
    ready.release();
    await gate;
    await route.continue();
  });
  try {
    await quote.goto(quotation.id);
    await quote.button("מחיקת ההצעה").click();
    await quote.button("אישור מחיקת ההצעה").click();
    await reached;
    await expect(quote.button("אישור מחיקת ההצעה")).toBeDisabled();
    await expect(quote.button("ביטול")).toBeDisabled();
    await quote.button("אישור מחיקת ההצעה").evaluate(element => {
      if (element instanceof HTMLButtonElement) {
        element.click();
      }
    });
    expect(requests).toHaveLength(1);
    held.release();
    await expect(page).toHaveURL(/\/quotations$/);
    expect((await api.send(HTTP_METHODS.GET, `/quotation/${quotation.id}`)).status()).toBe(404);
  } finally {
    held.release();
  }
});
