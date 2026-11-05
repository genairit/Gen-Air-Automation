import {
  seedCustomer,
  buildCustomerInput,
  seedStandaloneProject,
} from "../../src/api/seed-data.ts";

import {
  saveQuotation,
  quotationWrite,
  createQuotation,
  quotationDocument,
} from "../../src/api/quotation.api.ts";

import { randomUUID } from "node:crypto";
import { test, expect } from "../../src/fixtures/test.fixture.ts";
import { HTTP_METHODS } from "../../src/constants/http.constant.ts";
import { PAYMENT_TERMS } from "../../src/constants/domain.constant.ts";
import { USER_ROLES } from "../../src/constants/user-role.constant.ts";
import { createQuotationPage } from "../../src/pages/quotation.page.ts";
import { TEST_USERS } from "../../src/constants/test-users.constant.ts";
import { PERMISSIONS } from "../../src/constants/permission.constant.ts";
import { withRolePermissions } from "../../src/environment/role-permissions.ts";
import { createCatalogueFixture } from "../../src/environment/quotation-fixtures.ts";
import { QUOTATION, QUOTATION_PERMISSIONS } from "../../src/constants/quotation.constant.ts";

const NOTES = "הערות פנימיות (לא יופיעו ללקוח)";
const NOTE = "הערה לתנאי התשלום (להצעה זו בלבד)";
const getQuote = async (api: Parameters<typeof createQuotation>[0], id: string) =>
  quotationDocument(await api.send(HTTP_METHODS.GET, `/quotation/${id}`));

test("customer-first creation, optional project, local payments and RTL desktop/mobile persist", async ({
  page,
  api,
}, testInfo) => {
  const customer = await api.createCustomer({
    ...buildCustomerInput(),
    paymentTerms: PAYMENT_TERMS.PREPAID,
  });
  const project = await seedStandaloneProject(api, customer);
  const quote = createQuotationPage(page);
  await page.goto("/quotations");
  await quote.button("הצעה חדשה").click();
  await expect(quote.button("יצירת הצעה")).toBeDisabled();
  await quote.chooseEntity("לקוח *", customer.name);
  await quote.button("יצירת הצעה").click();
  await expect(page).toHaveURL(/\/quotations\/[\w-]+$/);
  const id = new URL(page.url()).pathname.split("/").at(-1)!;
  await expect(quote.field("פרויקט (אופציונלי)")).toHaveValue("");
  await expect(page.getByRole("radio", { name: "תשלום מראש", exact: true })).toBeChecked();
  await expect(quote.field(NOTE)).toHaveValue("");
  await quote.fill(NOTE, "Quotation terms only");
  await quote.fill(NOTES, "Internal information");
  await quote.selectEntity("פרויקט (אופציונלי)", project.name);
  expect(
    (
      await api.send(HTTP_METHODS.PATCH, `/customer/${customer.id}`, {
        paymentTerms: PAYMENT_TERMS.OTHER,
      })
    ).status(),
  ).toBe(200);
  await page.reload();
  await expect(page.getByRole("radio", { name: "תשלום מראש", exact: true })).toBeChecked();
  await expect(quote.field("פרויקט (אופציונלי)")).toHaveValue(project.name);
  expect((await getQuote(api, id)).projectId).toBe(project.id);
  await expect(quote.field(NOTE)).toHaveValue("Quotation terms only");
  expect((await getQuote(api, id)).internalNotes).toBe("Internal information");
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  await expect(page.getByRole("heading", { name: "תנאי תשלום", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "בדיקה ואישור", exact: true })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("quotation-desktop.png"), fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(quote.field("לקוח *")).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath("quotation-mobile.png"), fullPage: true });
  await expect(page.getByRole("button", { name: /PDF|Priority|Drive|ייצוא/ })).toHaveCount(0);
  await page.goto("/quotations");
  await quote.field("חיפוש לפי מספר, לקוח, פרויקט או חברה").fill(customer.name);
  await expect(
    page.getByRole("button").filter({ hasText: (await getQuote(api, id)).number }),
  ).toBeVisible();
});

test("catalogue filters, repeated independent snapshots, section ordering and server decimal totals", async ({
  page,
  api,
}) => {
  const item = await createCatalogueFixture({ equipmentTypes: ["עילי"] });
  const hidden = await createCatalogueFixture({
    status: QUOTATION.CATALOGUE.ARCHIVED,
    sku: `${item.sku}-archived`,
  });
  const incompatible = await createCatalogueFixture({
    brand: QUOTATION.OTHER_BRAND,
    sku: `${item.sku}-other`,
  });
  const customer = await seedCustomer(api);
  const initial = await createQuotation(api, customer.id);
  const quote = createQuotationPage(page);
  await quote.goto(initial.id);
  await quote.select("חברת מיזוג", QUOTATION.BRAND);
  await quote.saved(() => quote.button("+ סינגלים").click());
  await quote.fill("כותרת מערכת / קומה", "First floor");
  await quote.field("סוג ציוד / לחץ").selectOption("עילי");
  await quote.field("גודל מבוקש (BTU)").fill("24000");
  await quote.field("חיפוש פריט בקטלוג").fill(item.sku);
  await expect(page.getByRole("button").filter({ hasText: item.sku }).first()).toBeVisible();
  await expect(page.getByRole("button").filter({ hasText: hidden.sku })).toHaveCount(0);
  await expect(page.getByRole("button").filter({ hasText: incompatible.sku })).toHaveCount(0);
  await quote.add(item.sku);
  await quote.fill("תיאור בהצעה", "Independent snapshot");
  await quote.fill("מיקום", "Kitchen");
  await quote.add(item.sku);
  await expect(quote.field("תיאור בהצעה")).toHaveCount(2);
  await expect(quote.field("תיאור בהצעה").nth(1)).toHaveValue(item.description);
  await quote.fill("מיקום", "Bedroom", 1);
  await expect(quote.amount("סכום השורות")).toHaveText(/20\.02/);
  await quote.fill("הנחה %", "10");
  await expect(quote.amount("מחיר כולל לפני מע״מ")).toHaveText(/18\.02/);
  await quote.fill("סכום סופי לפני מע״מ (יעד)", "15");
  await expect(quote.field("הנחה %")).toBeDisabled();
  await expect(quote.amount("מחיר כולל לפני מע״מ")).toHaveText(/15\.00/);

  const saved = await getQuote(api, initial.id);
  await expect(page.getByText(`מע״מ ${Number(saved.vatRate)}%`, { exact: true })).toBeVisible();
  expect(saved.totals.total).toBe("17.70");
  await quote.saved(() => quote.button("+ פריטים נוספים").click());
  await quote.fill("כותרת מערכת / קומה", "Second floor", 1);
  await quote.saved(() => quote.button("הזז למעלה").nth(1).click());
  await page.reload();
  await expect(quote.field("כותרת מערכת / קומה").nth(0)).toHaveValue("Second floor");
  await expect(quote.field("מיקום").nth(0)).toHaveValue("Kitchen");
  await expect(quote.field("מיקום").nth(1)).toHaveValue("Bedroom");
  await expect(quote.field("תיאור בהצעה").nth(0)).toHaveValue("Independent snapshot");
  expect(
    (
      await api.send(HTTP_METHODS.PATCH, `/catalogue-item/${item.id}`, {
        status: QUOTATION.CATALOGUE.ARCHIVED,
        description: "Changed catalogue",
        price: "99",
      })
    ).status(),
  ).toBe(200);
  await page.reload();
  await expect(quote.field("תיאור בהצעה").nth(0)).toHaveValue("Independent snapshot");
  await expect(quote.field("מחיר ליחידה").nth(0)).toHaveValue("10.005");
  expect(
    (await getQuote(api, initial.id)).sections
      .flatMap(section => section.items)
      .find(line => line.catalogueItemId === item.id)!.quotedPrice,
  ).toBe("10.0050");
  expect((await getQuote(api, initial.id)).id).toBe(initial.id);
});

test("autosave keeps row focus and add-item draft while later edits persist", async ({
  page,
  api,
}) => {
  const item = await createCatalogueFixture({
    systemType: QUOTATION.SYSTEM.VRF,
    equipmentRole: QUOTATION.ROLE.INDOOR,
  });
  const customer = await seedCustomer(api);
  const initial = await createQuotation(api, customer.id);
  const quote = createQuotationPage(page);
  await quote.goto(initial.id);
  await quote.select("חברת מיזוג", QUOTATION.BRAND);
  await quote.saved(() => quote.button("+ מערכת VRF").click());
  await quote.add(item.sku);
  const row = page.locator('[data-role="indoor"]');
  const location = row.getByLabel("מיקום", { exact: true });
  await expect(row.getByText("מיקום היחידה", { exact: true })).toBeVisible();
  await expect(row.getByText("מעגל", { exact: true })).toBeVisible();
  await expect(page.getByText("חברת מיזוג (לכל ההצעה)", { exact: true })).toBeVisible();
  await expect(quote.field("חברת מיזוג")).toHaveCount(1);
  await quote.field("כמות להוספה").fill("3");

  const release = { resolve: () => {} };
  const saveGate = new Promise<void>(resolve => {
    release.resolve = resolve;
  });
  const routeState = { held: false };
  await page.route(`**/quotation/${initial.id}`, async route => {
    if (route.request().method() === HTTP_METHODS.PUT && !routeState.held) {
      routeState.held = true;
      await saveGate;
    }
    await route.continue();
  });
  try {
    const firstRequest = page.waitForRequest(
      request => request.method() === HTTP_METHODS.PUT && request.url().endsWith(initial.id),
    );
    const firstSave = page.waitForResponse(
      response =>
        response.request().method() === HTTP_METHODS.PUT && response.url().endsWith(initial.id),
    );
    await location.fill("Kitchen");
    await firstRequest;
    await expect.poll(() => routeState.held).toBe(true);
    await expect(location).toBeEnabled();
    await expect(location).toBeFocused();
    await expect(quote.field("כמות להוספה")).toHaveValue("3");
    const secondSave = page.waitForResponse(
      response =>
        response.request().method() === HTTP_METHODS.PUT &&
        response.url().endsWith(initial.id) &&
        response.request().postData()?.includes("Bedroom") === true,
    );
    await location.fill("Bedroom");
    await expect(location).toHaveValue("Bedroom");
    release.resolve();
    expect((await firstSave).status()).toBe(200);
    await expect(location).toBeFocused();
    expect((await secondSave).status()).toBe(200);
    await expect
      .poll(async () => (await getQuote(api, initial.id)).sections[0]?.items[0]?.location)
      .toBe("Bedroom");
    await page.reload();
    await expect(location).toHaveValue("Bedroom");
  } finally {
    release.resolve();
  }
});

test("required warnings block approval, explicit self approval and repeated reopen/review remain durable", async ({
  page,
  api,
}, testInfo) => {
  const customer = await seedCustomer(api);
  const initial = await createQuotation(api, customer.id);
  const quote = createQuotationPage(page);
  await quote.goto(initial.id);
  const item = await createCatalogueFixture();
  await quote.select("חברת מיזוג", QUOTATION.BRAND);
  await quote.saved(() => quote.button("+ סינגלים").click());
  await quote.add(item.sku);
  await quote.saved(() => quote.button("הוסף שלב תשלום").click());
  await quote.fill("אחוז מהסכום", "50");
  await quote.fill("מועד / אבן דרך", "Deposit");
  await quote.transition("סיימתי, לבדיקה");
  await expect(page.getByRole("heading", { name: "סיכום לבדיקה" })).toBeVisible();
  await expect(page.getByRole("cell", { name: item.sku, exact: true })).toBeVisible();
  await page.screenshot({
    path: testInfo.outputPath("quotation-review-desktop.png"),
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(quote.button("עריכה")).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({
    path: testInfo.outputPath("quotation-review-mobile.png"),
    fullPage: true,
  });
  await page.setViewportSize({ width: 1280, height: 720 });
  await expect(quote.button("אישור ההצעה")).toBeDisabled();
  const warnings = page.getByRole("checkbox");
  expect(await warnings.count()).toBeGreaterThan(0);
  await quote.acknowledge();
  await quote.transition("אישור ההצעה");
  await expect(quote.field(NOTES)).toBeDisabled();
  await page.reload();
  expect((await getQuote(api, initial.id)).approvedById).not.toBeNull();
  for (const cycle of [1, 2]) {
    await quote.transition("פתיחה לעריכה (אותו מזהה)");
    await expect(quote.field(NOTES)).toBeEnabled();
    await quote.fill(NOTES, `Cycle ${cycle}`);
    await quote.transition("סיימתי, לבדיקה");
    await expect(page.getByRole("heading", { name: "סיכום לבדיקה" })).toBeVisible();
    await quote.button("עריכה").click();
    await expect(quote.field("אחוז מהסכום")).toBeVisible();
    await quote.transition("חזרה לטיוטה");
    await expect(quote.field(NOTES)).toHaveValue(`Cycle ${cycle}`);
    await quote.transition("סיימתי, לבדיקה");
    await expect(page.getByRole("heading", { name: "סיכום לבדיקה" })).toBeVisible();
    await quote.acknowledge();
    await quote.transition("אישור ההצעה");
  }
  expect((await getQuote(api, initial.id)).id).toBe(initial.id);
});

test("transport failure keeps unsaved edit, retry persists; actual version conflict reloads server value", async ({
  page,
  api,
}) => {
  const customer = await seedCustomer(api);
  const initial = await createQuotation(api, customer.id);
  const quote = createQuotationPage(page);
  await quote.goto(initial.id);
  await page.route(`**/quotation/${initial.id}`, async route => {
    if (route.request().method() === HTTP_METHODS.PUT) {
      await route.abort("connectionfailed");
      return;
    }

    await route.continue();
  });
  await quote.field(NOTES).fill("Retained after network error");
  await expect(page.getByRole("alert")).toBeVisible();
  await expect(quote.field(NOTES)).toHaveValue("Retained after network error");
  await expect(quote.button("סיימתי, לבדיקה")).toBeDisabled();
  expect((await getQuote(api, initial.id)).internalNotes).toBe("");
  await page.unroute(`**/quotation/${initial.id}`);
  await quote.saved(() => quote.button("נסה לשמור שוב").click());
  expect((await getQuote(api, initial.id)).internalNotes).toBe("Retained after network error");
  const current = await getQuote(api, initial.id);
  await saveQuotation(api, initial.id, {
    ...quotationWrite(current),
    internalNotes: "Other editor saved",
  });
  const conflict = page.waitForResponse(
    r => r.request().method() === HTTP_METHODS.PUT && r.url().endsWith(initial.id),
  );
  await quote.field(NOTES).fill("Stale editor edit");
  expect((await conflict).status()).toBe(409);
  await expect(page.getByRole("alert")).toBeVisible();
  await quote.button("טען גרסה מהשרת").click();
  await expect(quote.field(NOTES)).toHaveValue("Other editor saved");
  await expect(page.getByRole("alert")).toHaveCount(0);
});

test("read-only role sees saved quotation without creation, mutation or approval controls", async ({
  api,
  openPageAs,
}) => {
  const customer = await seedCustomer(api);
  const initial = await createQuotation(api, customer.id);
  await withRolePermissions(
    USER_ROLES.ENGINEER,
    [QUOTATION_PERMISSIONS.READ, PERMISSIONS.CUSTOMERS_READ, PERMISSIONS.PROJECTS_READ],
    async () => {
      const page = await openPageAs(TEST_USERS[USER_ROLES.ENGINEER]);
      const quote = createQuotationPage(page);
      await page.goto("/quotations");
      await expect(page.getByRole("heading", { name: "הצעות מחיר" })).toBeVisible();
      await expect(quote.button("הצעה חדשה")).toHaveCount(0);
      await quote.goto(initial.id);
      await expect(quote.field(NOTES)).toBeDisabled();
      await expect(quote.button("סיימתי, לבדיקה")).toHaveCount(0);
      await expect(quote.button("הוסף שלב תשלום")).toHaveCount(0);
      for (const system of ["מערכת VRF", "מולטי / VRF BOX", "סינגלים", "פריטים נוספים"]) {
        await expect(quote.button(`+ ${system}`)).toHaveCount(0);
      }
      expect((await getQuote(api, initial.id)).version).toBe(initial.version);
    },
  );
});

test("private usage ranks genuine selections while capacity filters remain authoritative in browser", async ({
  page,
  api,
  openPageAs,
}) => {
  const prefix = `QA-browser-${randomUUID()}`;
  const close = await createCatalogueFixture({ sku: `${prefix}-a`, capacityBtu: 24000 });
  const far = await createCatalogueFixture({ sku: `${prefix}-z`, capacityBtu: 48000 });
  const customer = await seedCustomer(api);
  const initial = await createQuotation(api, customer.id);
  const quote = createQuotationPage(page);
  await quote.goto(initial.id);
  await quote.select("חברת מיזוג", QUOTATION.BRAND);
  await quote.saved(() => quote.button("+ סינגלים").click());
  await quote.add(far.sku);
  await quote.field("חיפוש פריט בקטלוג").fill(prefix);
  const results = page.getByRole("button").filter({ hasText: prefix });
  // Only search results, rather than headings containing selected line snapshots.
  await expect(results.first()).toContainText(far.sku);
  await quote.field("גודל מבוקש (BTU)").fill("24000");
  await expect(results.first()).toContainText(close.sku);
  await withRolePermissions(
    USER_ROLES.ENGINEER,
    [
      QUOTATION_PERMISSIONS.READ,
      QUOTATION_PERMISSIONS.UPDATE,
      PERMISSIONS.CUSTOMERS_READ,
      PERMISSIONS.PROJECTS_READ,
    ],
    async () => {
      const other = await openPageAs(TEST_USERS[USER_ROLES.ENGINEER]);
      const otherQuote = createQuotationPage(other);
      await otherQuote.goto(initial.id);
      await otherQuote.field("חיפוש פריט בקטלוג").fill(prefix);
      await expect(other.getByRole("button").filter({ hasText: prefix }).first()).toContainText(
        close.sku,
      );
    },
  );
  await quote.field("חיפוש פריט בקטלוג").fill(`${prefix}-missing`);
  await expect(page.getByText("לא נמצא פריט קטלוג מתאים. לא נוספה שורה.")).toBeVisible();
  expect((await getQuote(api, initial.id)).sections[0]!.items).toHaveLength(1);
});

test("VRF circuits, included controls, linked accessory quantities and removal survive reload", async ({
  page,
  api,
}) => {
  const indoor = await createCatalogueFixture({
    systemType: QUOTATION.SYSTEM.VRF,
    equipmentRole: QUOTATION.ROLE.INDOOR,
    includesRemote: true,
  });
  const control = await createCatalogueFixture({
    systemType: QUOTATION.SYSTEM.VRF,
    equipmentRole: QUOTATION.ROLE.CONTROL,
    capacityBtu: null,
  });
  const customer = await seedCustomer(api);
  const initial = await createQuotation(api, customer.id);
  const quote = createQuotationPage(page);
  await quote.goto(initial.id);
  await quote.select("חברת מיזוג", QUOTATION.BRAND);
  await quote.saved(() => quote.button("+ מערכת VRF").click());
  await quote.add(indoor.sku);
  await expect(page.getByText("כולל שלט במחיר היחידה")).toBeVisible();
  await quote.fill("מיקום", "Main hall");
  await quote.fill("כמות (יח׳)", "2");
  await quote.select("מעגל", "B");
  const remote = await createCatalogueFixture({
    description: "שלט QA included",
    systemType: QUOTATION.SYSTEM.VRF,
    equipmentRole: QUOTATION.ROLE.CONTROL,
    capacityBtu: null,
  });
  await quote.field("סוג פריט").selectOption("control");
  await quote.add(remote.sku);
  const remoteQuote = await getQuote(api, initial.id);
  const indoorId = remoteQuote.sections[0]!.items[0]!.id;
  await expect(quote.field("בקר עבור יחידה").locator("option")).toHaveCount(1);
  await expect(quote.field("בקר עבור יחידה").locator(`option[value="${indoorId}"]`)).toHaveCount(0);
  const forged = quotationWrite(remoteQuote);
  forged.sections[0]!.items[1]!.parentItemId = indoorId;
  expect((await api.send(HTTP_METHODS.PUT, `/quotation/${initial.id}`, forged)).status()).toBe(400);
  await quote.saved(() => quote.button("הסר שורה").nth(1).click());
  await quote.field("סוג פריט").selectOption(QUOTATION.ROLE.CONTROL);
  await quote.add(control.sku);
  const saved = await getQuote(api, initial.id);
  const parent = saved.sections[0]!.items[0]!;
  await quote.select("בקר עבור יחידה", parent.id);
  await expect(quote.field("כמות (יח׳)")).toHaveCount(1);
  await expect(page.getByText(/2 יח׳ ·/)).toBeVisible();
  expect((await getQuote(api, initial.id)).sections[0]!.items[1]!.quantity).toBe("2.0000");
  await page.reload();
  await expect(quote.field("מעגל")).toHaveValue("B");
  await expect(quote.field("בקר עבור יחידה")).toHaveValue(parent.id);
  await quote.saved(() => quote.button("הסר שורה").nth(0).click());
  await expect(quote.field("תיאור בהצעה")).toHaveCount(0);
  expect((await getQuote(api, initial.id)).sections[0]!.items).toHaveLength(0);
});

test("missing quotation read grant denies direct editor and hides navigation", async ({
  api,
  openPageAs,
}) => {
  const initial = await createQuotation(api, (await seedCustomer(api)).id);
  await withRolePermissions(USER_ROLES.ENGINEER, [PERMISSIONS.PROJECTS_READ], async () => {
    const page = await openPageAs(TEST_USERS[USER_ROLES.ENGINEER]);
    await page.goto(`/quotations/${initial.id}`);
    await expect(page.getByRole("button", { name: "הצעות מחיר", exact: true })).toHaveCount(0);
    await expect(page.getByRole("heading", { name: initial.number })).toHaveCount(0);
    await expect(page.getByRole("textbox", { name: NOTES, exact: true })).toHaveCount(0);
    await expect(page.getByText("אין הרשאה לפעולה זו", { exact: true })).toBeVisible();
  });
});

test("brand replacement confirms, preserves placement and quantities, missing match keeps original", async ({
  page,
  api,
}) => {
  const original = await createCatalogueFixture({ capacityBtu: 98765, equipmentTypes: ["עילי"] });
  const replacement = await createCatalogueFixture({
    brand: QUOTATION.OTHER_BRAND,
    equipmentTypes: ["עילי"],
    capacityBtu: 98765,
  });
  const initial = await createQuotation(api, (await seedCustomer(api)).id);
  const quote = createQuotationPage(page);
  await quote.goto(initial.id);
  await quote.select("חברת מיזוג", QUOTATION.BRAND);
  await quote.saved(() => quote.button("+ סינגלים").click());
  await quote.add(original.sku);
  await quote.fill("מיקום", "Roof office");
  await quote.fill("כמות (יח׳)", "3");
  const before = await getQuote(api, initial.id);
  await quote.field("חברת מיזוג").selectOption(QUOTATION.OTHER_BRAND);
  await expect(quote.button("החלף לפריטים תואמים")).toBeVisible();
  expect((await getQuote(api, initial.id)).brand).toBe(QUOTATION.BRAND);
  await quote.button("ביטול").click();
  await expect(quote.field("חברת מיזוג")).toHaveValue(QUOTATION.BRAND);
  await quote.field("חברת מיזוג").selectOption(QUOTATION.OTHER_BRAND);
  await quote.saved(() => quote.button("החלף לפריטים תואמים").click());
  const changed = await getQuote(api, initial.id);
  expect(changed.sections[0]!.items[0]!.catalogueItemId).toBe(replacement.id);
  expect(changed.sections[0]!.items[0]!.id).toBe(before.sections[0]!.items[0]!.id);
  await expect(quote.field("מיקום")).toHaveValue("Roof office");
  await expect(quote.field("כמות (יח׳)")).toHaveValue("3");
  expect(changed.sections[0]!.items[0]!.quantity).toBe("3.0000");
  await quote.field("חברת מיזוג").selectOption("טושיבה");
  await quote.button("החלף לפריטים תואמים").click();
  await expect(page.getByRole("alert")).toContainText("ההצעה לא שונתה");
  await expect(quote.field("חברת מיזוג")).toHaveValue(QUOTATION.OTHER_BRAND);
  expect((await getQuote(api, initial.id)).version).toBe(changed.version);
  await page.reload();
  await expect(quote.field("חברת מיזוג")).toHaveValue(QUOTATION.OTHER_BRAND);
  await expect(quote.field("מיקום")).toHaveValue("Roof office");
});

test("pre-add placement and quantities persist while decimal focus edits retain exact snapshots and payment chips save", async ({
  page,
  api,
}) => {
  const item = await createCatalogueFixture({
    systemType: QUOTATION.SYSTEM.VRF,
    equipmentRole: QUOTATION.ROLE.INDOOR,
  });
  const customer = await api.createCustomer({
    ...buildCustomerInput(),
    paymentTerms: PAYMENT_TERMS.PREPAID,
  });
  const initial = await createQuotation(api, customer.id);
  const quote = createQuotationPage(page);
  await quote.goto(initial.id);
  await quote.select("חברת מיזוג", QUOTATION.BRAND);
  await quote.saved(() => quote.button("+ מערכת VRF").click());
  await quote.field("כמות להוספה").fill("2");
  await quote.field("מיקום להוספה").fill("QA new room");
  await quote.field("מעגל להוספה").selectOption("B");
  await quote.add(item.sku);
  const addedDocument = await getQuote(api, initial.id);
  const added = addedDocument.sections[0]!.items[0]!;
  expect(added).toMatchObject({
    quantity: "2.0000",
    location: "QA new room",
    circuit: "B",
    quotedPrice: "10.0050",
  });
  await expect(quote.field("מחיר ליחידה")).toHaveValue("10.005");
  await quote.field("מחיר ליחידה").focus();
  await expect(quote.field("מחיר ליחידה")).toHaveValue("10.005");
  await quote.field(NOTES).focus();
  await expect(quote.field("מחיר ליחידה")).toHaveValue("10.005");
  expect((await getQuote(api, initial.id)).version).toBe(addedDocument.version);
  await quote.fill("מחיר ליחידה", "8.1250");
  await quote.fill("כמות (יח׳)", "3");
  await quote.fill("הנחה %", "10");
  const saved = await getQuote(api, initial.id);
  expect(saved.discountPercent).toBe("10.0000");
  expect(saved.sections[0]!.items[0]!).toMatchObject({ quantity: "3.0000", quotedPrice: "8.1250" });
  await quote.saved(() => page.getByRole("radio", { name: "אחר", exact: true }).click());
  await quote.fill(NOTE, "Quotation chip terms");
  await page.reload();
  await expect(page.getByRole("radio", { name: "אחר", exact: true })).toBeChecked();
  await expect(quote.field(NOTE)).toHaveValue("Quotation chip terms");
  await expect(quote.field("מחיר ליחידה")).toHaveValue("8.125");
  await expect(quote.field("כמות (יח׳)")).toHaveValue("3");
  expect(
    (await (await api.send(HTTP_METHODS.GET, `/customer/${customer.id}`)).json()).paymentTerms,
  ).toBe(PAYMENT_TERMS.PREPAID);
});
