import { randomUUID } from "node:crypto";
import type { Page } from "@playwright/test";
import { test, expect } from "../../src/fixtures/test.fixture.ts";
import { URLS } from "../../src/constants/environment.constant.ts";
import { USER_ROLES } from "../../src/constants/user-role.constant.ts";
import { TEST_USERS } from "../../src/constants/test-users.constant.ts";
import { createDeferred } from "../../src/utilities/deferred.utility.ts";
import { HTTP_METHODS, HTTP_STATUS } from "../../src/constants/http.constant.ts";
import { createCatalogueFixture } from "../../src/environment/quotation-fixtures.ts";

const CATALOGUE = "/catalogue";
const API = "/catalogue-item";
const TITLE = "פריטי קטלוג";
const CREATE = "פריט קטלוג חדש";
const EDIT = "עריכת פריט קטלוג";
const PREVIEW = "כרטיס פריט";
const LIST = "רשימת פריטי קטלוג";
const SEARCH = "חיפוש לפי מק״ט, תיאור או BTU";
const DESCRIPTION = "תיאור";
const SKU = "מק״ט";
const UNIT = "יחידת מידה";
const PRICE = "מחיר ליחידה (₪)";
const CAPACITY = "תפוקה (BTU)";
const CANCEL = "ביטול";

const title = (page: Page, name: string) => page.getByRole("heading", { name, exact: true });
const button = (page: Page, name: string) => page.getByRole("button", { name, exact: true });
const field = (page: Page, name: string) =>
  page.getByRole("region", { name: "פרטי פריט", exact: true }).getByRole("textbox", { name });
const search = (page: Page) => page.getByRole("searchbox", { name: SEARCH, exact: true });
const row = (page: Page, sku: string, description: string) =>
  page.getByRole("button", { name: `פתיחת פריט ${sku} · ${description}`, exact: true });

test("catalogue manager creates, edits and archives an item from the Hebrew desktop catalogue", async ({
  page,
  api,
}, testInfo) => {
  const sku = `QA-${randomUUID()}`;
  const description = "יחידת קטלוג לבדיקת התצוגה";
  const edited = "יחידת קטלוג עם תיאור מעודכן";
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(CATALOGUE);
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  await expect(title(page, TITLE)).toHaveCSS("font-weight", "800");
  await button(page, CREATE).click();
  await expect(title(page, CREATE)).toBeVisible();
  await expect(page.getByRole("region", { name: LIST })).toHaveCount(0);
  await button(page, "יצירת פריט").click();
  await expect(page.getByText("יש למלא את השדה")).toHaveCount(4);
  await field(page, DESCRIPTION).fill(description);
  await field(page, SKU).fill(sku);
  await field(page, UNIT).fill("יחידה");
  await field(page, PRICE).fill("123.45");
  await field(page, CAPACITY).fill("38000");
  await page.screenshot({ path: testInfo.outputPath("catalogue-create-desktop.png") });
  await button(page, "יצירת פריט").click();
  await expect(page.getByText("פריט הקטלוג נוצר", { exact: true })).toBeVisible();
  await search(page).fill(sku);
  const createdRow = row(page, sku, description);
  await expect(createdRow.getByText("₪123.45", { exact: true })).toHaveCSS("font-weight", "700");
  await expect(createdRow.getByText(description, { exact: true })).toHaveCSS("font-weight", "700");
  await expect(createdRow.getByText("38,000 BTU", { exact: true })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("catalogue-list-desktop.png") });
  await createdRow.focus();
  await createdRow.press("Enter");
  await expect(title(page, EDIT)).toBeVisible();
  const id = new URL(page.url()).searchParams.get("item");
  expect(id).toEqual(expect.any(String));
  await expect(field(page, SKU)).toHaveJSProperty("readOnly", true);
  await expect(field(page, DESCRIPTION)).toHaveValue(description);
  await button(page, CANCEL).click();
  await expect(search(page)).toHaveValue(sku);

  await createdRow.click();
  await field(page, DESCRIPTION).fill(edited);
  await field(page, PRICE).fill("0");
  await button(page, "שמירת שינויים").click();
  await expect(page.getByText("השינויים נשמרו", { exact: true })).toBeVisible();
  const editedRow = row(page, sku, edited);
  await expect(editedRow.getByText("₪0.00", { exact: true })).toBeVisible();
  const pricedOnly = page.getByRole("checkbox", { name: "רק פריטים עם מחיר" });
  await pricedOnly.check();
  await expect(editedRow).toHaveCount(0);
  await expect(page.getByText("לא נמצאו פריטים שתואמים לחיפוש")).toBeVisible();
  await pricedOnly.uncheck();
  await editedRow.click();
  await expect(field(page, DESCRIPTION)).toHaveValue(edited);
  await expect(field(page, PRICE)).toHaveValue("0.0000");
  await page.screenshot({ path: testInfo.outputPath("catalogue-edit-desktop.png") });

  const archive = button(page, "הסרה מהקטלוג");
  await archive.click();
  const dialog = page.getByRole("dialog", { name: "הסרת פריט מהקטלוג" });
  await expect(dialog).toContainText("מסמכים שמורים ימשיכו לכלול אותו");
  await dialog.getByRole("button", { name: CANCEL, exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(archive).toBeFocused();
  await archive.click();
  await dialog.getByRole("button", { name: "הסרת הפריט", exact: true }).click();
  await expect(page.getByText("הפריט הוסר מהקטלוג", { exact: true })).toBeVisible();
  await expect(editedRow).toHaveCount(0);
  const historical = await api.send(HTTP_METHODS.GET, `${API}/${id}`);
  expect(historical.status()).toBe(HTTP_STATUS.OK);
  expect(await historical.json()).toMatchObject({ id, sku, status: "archived" });
});

test("catalogue row keyboard focus returns after cancelling the editor", async ({ page }) => {
  const item = await createCatalogueFixture();
  await page.goto(CATALOGUE);
  await search(page).fill(item.sku);
  const target = row(page, item.sku, item.description);
  await expect(target).toBeVisible();
  await target.focus();
  await target.press("Enter");
  await expect(title(page, EDIT)).toBeVisible();
  await button(page, CANCEL).click();
  await expect(target).toBeFocused();
  await expect(search(page)).toHaveValue(item.sku);
});

test("catalogue reader can search and inspect mobile details without write actions", async ({
  openPageAs,
}, testInfo) => {
  const item = await createCatalogueFixture({ description: "יחידה לבדיקת קטלוג בנייד" });
  const page = await openPageAs(TEST_USERS[USER_ROLES.ENGINEER]);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(new URL(CATALOGUE, URLS.FRONTEND).href);
  await expect(title(page, TITLE)).toHaveCSS("font-size", "28px");
  await expect(button(page, CREATE)).toHaveCount(0);
  await search(page).fill(item.description);
  const target = row(page, item.sku, item.description);
  await expect(target).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath("catalogue-list-mobile.png") });
  await target.click();
  await expect(title(page, PREVIEW)).toBeVisible();
  await expect(page.getByRole("heading", { name: item.description })).toBeVisible();
  await expect(button(page, "שמירת שינויים")).toHaveCount(0);
  await expect(button(page, "הסרה מהקטלוג")).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath("catalogue-read-mobile.png") });
  await button(page, "חזרה לקטלוג").click();
  await expect(search(page)).toHaveValue(item.description);
});

test("a catalogue update that finishes after navigation keeps the new item open", async ({
  page,
  api,
}) => {
  const first = await createCatalogueFixture();
  const second = await createCatalogueFixture();
  const changed = "תיאור שנשמר אחרי ניווט";
  const updateReceived = createDeferred();
  const deliverResponse = createDeferred();
  const updatePattern = `**${API}/${first.id}`;
  await page.goto(CATALOGUE);
  await search(page).fill(first.sku);
  await row(page, first.sku, first.description).click();
  await expect(title(page, EDIT)).toBeVisible();
  await field(page, DESCRIPTION).fill(changed);

  await page.route(updatePattern, async route => {
    if (route.request().method() !== HTTP_METHODS.PATCH) {
      await route.continue();
      return;
    }
    const response = await route.fetch();
    updateReceived.resolve();
    await deliverResponse.promise;
    await route.fulfill({ response });
  });
  try {
    await button(page, "שמירת שינויים").click();
    await updateReceived.promise;
    await page.goBack();
    await search(page).fill(second.sku);
    await row(page, second.sku, second.description).click();
    await expect(field(page, SKU)).toHaveValue(second.sku);
    const refreshed = page.waitForResponse(response =>
      new URL(response.url()).pathname.endsWith(`${API}/maintenance`),
    );
    deliverResponse.resolve();
    const refreshedList = await refreshed;
    expect([HTTP_STATUS.OK, 304]).toContain(refreshedList.status());
    expect(await refreshedList.finished()).toBeNull();
    await page.evaluate(
      () =>
        new Promise<void>(resolve => {
          requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
        }),
    );
    await expect(field(page, SKU)).toHaveValue(second.sku);
    await expect(title(page, EDIT)).toBeVisible();
    await expect(page).toHaveURL(new RegExp(`item=${second.id}$`));
    const persisted = await api.send(HTTP_METHODS.GET, `${API}/${first.id}`);
    expect(await persisted.json()).toMatchObject({ id: first.id, description: changed });
  } finally {
    deliverResponse.resolve();
    await page.unroute(updatePattern);
  }
});

test("duplicate SKU rejects catalogue creation and keeps the manager's draft in place", async ({
  page,
}) => {
  const item = await createCatalogueFixture();
  const description = "טיוטת פריט עם מק״ט כפול";
  await page.goto(CATALOGUE);
  await button(page, CREATE).click();
  await field(page, DESCRIPTION).fill(description);
  await field(page, SKU).fill(item.sku);
  await field(page, UNIT).fill("יחידה");
  await field(page, PRICE).fill("16.55");
  await button(page, "יצירת פריט").click();
  await expect(page.getByText("מק״ט זה כבר פעיל בקטלוג", { exact: true })).toBeVisible();
  await expect(title(page, CREATE)).toBeVisible();
  await expect(field(page, DESCRIPTION)).toHaveValue(description);
  await expect(field(page, SKU)).toHaveValue(item.sku);
  await expect(field(page, PRICE)).toHaveValue("16.55");
  await button(page, CANCEL).click();
  await expect(title(page, TITLE)).toBeVisible();
});
