import {
  quotationBox,
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
  test(`top-left trash confirms ${status} deletion and returns to refreshed list`, async ({
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
    for (const width of [1440, 390]) {
      await page.setViewportSize({ width, height: 1100 });
      await quote.goto(quotation.id);
      const remove = quote.button("מחיקת ההצעה");
      const action = await quotationBox(remove);
      const heading = await quotationBox(
        page.getByRole("heading", { name: quotation.number, exact: true }),
      );
      expect(action.width).toBeGreaterThanOrEqual(44);
      expect(action.height).toBeGreaterThanOrEqual(44);
      expect(action.x).toBeLessThan(heading.x);
      await expectQuotationWithinViewport(page, [remove]);
      await page.screenshot({ path: testInfo.outputPath(`delete-${status}-${width}-header.png`) });
    }
    const remove = quote.button("מחיקת ההצעה");
    await remove.click();
    const dialog = page.getByRole("dialog", { name: "מחיקת הצעה" });
    await expect(dialog).toContainText(quotation.number);
    expect(deletions).toEqual([]);
    await dialog.getByRole("button", { name: "חזרה" }).click();
    await expect(dialog).toHaveCount(0);
    expect(
      (await quotationDocument(await api.send(HTTP_METHODS.GET, `/quotation/${quotation.id}`)))
        .version,
    ).toBe(quotation.version);
    await remove.click();
    const response = page.waitForResponse(
      response =>
        response.request().method() === HTTP_METHODS.DELETE &&
        response.url().endsWith(`/quotation/${quotation.id}`),
    );
    await dialog.getByRole("button", { name: "מחק הצעה" }).click();
    expect((await response).status()).toBe(204);
    await expect(page).toHaveURL(/\/quotations$/);
    await quote.field("חיפוש לפי מספר, לקוח, פרויקט או חברה").fill(customer.name);
    await expect(page.getByRole("button", { name: "הכל 0", exact: true })).toBeVisible();
    expect(deletions).toHaveLength(1);
  });
}

test("failed delete keeps confirmation open, reload resolves actual stale version and retry succeeds", async ({
  page,
  api,
}) => {
  const { quotation } = await seedQuotationForDeletion(api, QUOTATION.STATUS.DRAFT);
  const quote = createQuotationPage(page);
  const diagnostics: Promise<unknown[]>[] = [];
  page.on("console", message => {
    diagnostics.push(Promise.all(message.args().map(argument => argument.jsonValue())));
  });
  await quote.goto(quotation.id);
  await quote.button("מחיקת ההצעה").click();
  await saveQuotation(api, quotation.id, {
    ...quotationWrite(quotation),
    internalNotes: "Changed in another tab",
  });
  const conflict = page.waitForResponse(
    response => response.request().method() === HTTP_METHODS.DELETE,
  );
  await quote.button("מחק הצעה").click();
  expect((await conflict).status()).toBe(409);
  await expect(page).toHaveURL(new RegExp(`/quotations/${quotation.id}$`));
  await expect(page.getByRole("alert")).toBeVisible();
  const logged = JSON.stringify(await Promise.all(diagnostics));
  expect(logged).toContain("Failed to delete quotation");
  expect(logged).not.toContain("Bearer ");
  expect(logged).not.toContain("Authorization");
  expect(logged).not.toMatch(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/);
  await expect(quote.button("מחק הצעה")).toBeEnabled();
  await quote.button("טען גרסה עדכנית").click();
  await expect(page.getByRole("alert")).toHaveCount(0);
  await quote.button("חזרה").click();
  await createQuotationPage(page).showDetails();
  await page.getByText("פרטים נוספים", { exact: true }).click();
  await expect(quote.field("הערות פנימיות (לא יופיעו ללקוח)")).toHaveValue(
    "Changed in another tab",
  );
  const success = page.waitForResponse(
    response => response.request().method() === HTTP_METHODS.DELETE,
  );
  await quote.button("מחיקת ההצעה").click();
  await quote.button("מחק הצעה").click();
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
      await quote.button("מחק הצעה").click();
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
    await quote.button("מחק הצעה").click();
    await reached;
    await expect(quote.button("מוחק...")).toBeDisabled();
    await expect(quote.button("חזרה")).toBeDisabled();
    await quote.button("מוחק...").evaluate(element => {
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
