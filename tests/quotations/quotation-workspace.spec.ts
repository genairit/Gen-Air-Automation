import {
  saveQuotation,
  quotationWrite,
  createQuotation,
  quotationDocument,
} from "../../src/api/quotation.api.ts";

import type {
  ICatalogueFixture,
  IQuotationWriteSection,
} from "../../src/interfaces/quotation.interface.ts";

import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { seedCustomer } from "../../src/api/seed-data.ts";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { test, expect } from "../../src/fixtures/test.fixture.ts";
import { QUOTATION } from "../../src/constants/quotation.constant.ts";
import { USER_ROLES } from "../../src/constants/user-role.constant.ts";
import { TEST_USERS } from "../../src/constants/test-users.constant.ts";
import { createQuotationPage } from "../../src/pages/quotation.page.ts";
import { selectMuiOption } from "../../src/pages/mui-select.component.ts";
import { withRolePermissions } from "../../src/environment/role-permissions.ts";
import { createCatalogueFixture } from "../../src/environment/quotation-fixtures.ts";

const line = (item: ICatalogueFixture) => ({
  id: randomUUID(),
  catalogueItemId: item.id,
  parentItemId: null,
  description: item.description,
  quotedPrice: item.price,
  quantity: "1",
  location: "Lobby",
  circuit: null,
  requestedCapacityBtu: item.capacityBtu,
});

const fixture = async (api: Parameters<typeof createQuotation>[0]) => {
  const customer = await seedCustomer(api);
  const initial = await createQuotation(api, customer.id);
  const first = await createCatalogueFixture({ description: "Lobby unit", price: "100.0000" });
  const second = await createCatalogueFixture({
    description: "Office unit",
    brand: QUOTATION.OTHER_BRAND,
    price: "200.0000",
  });
  const general = await createCatalogueFixture({
    description: "Crane hire",
    brand: "",
    systemType: "GEN",
    equipmentRole: "other",
    capacityBtu: null,
    price: "50.0000",
  });
  const floor = randomUUID();
  const sections: IQuotationWriteSection[] = [
    {
      id: randomUUID(),
      title: "Lobby system",
      brand: first.brand,
      systemType: "SINGLE",
      floorId: floor,
      floorName: "First floor",
      items: [line(first)],
    },
    {
      id: randomUUID(),
      title: "Office system",
      brand: second.brand,
      systemType: "SINGLE",
      floorId: floor,
      floorName: "First floor",
      items: [line(second)],
    },
    {
      id: randomUUID(),
      title: "Roof system",
      brand: first.brand,
      systemType: "SINGLE",
      items: [line(first)],
    },
    {
      id: randomUUID(),
      title: "Project services",
      brand: null,
      systemType: "GEN",
      items: [line(general)],
    },
  ];
  const quotation = await saveQuotation(api, initial.id, {
    ...quotationWrite(initial),
    brand: first.brand,
    brands: [first.brand, second.brand],
    internalNotes: "PRIVATE STAFF NOTE",
    sections,
  });
  return { quotation, first, second, general };
};

test("mixed floors, company systems and General stay identical across live editing, reopen, view and PDF", async ({
  api,
  page,
}, info) => {
  await page.setViewportSize({ width: 1800, height: 1100 });
  const { quotation, first, second, general } = await fixture(api);
  const editor = createQuotationPage(page);
  await editor.goto(quotation.id);
  const table = page.getByRole("table", { name: "פריטי ההצעה", exact: true });
  const document = page.getByRole("article", { name: "מסמך ההצעה", exact: true });
  await expect(table).toBeVisible();
  await expect(document).toBeVisible();
  await expect(page.getByRole("button", { name: /פרטי הצעה/ })).toHaveAttribute(
    "aria-expanded",
    "false",
  );
  await expect(table.getByText("First floor", { exact: true })).toHaveCount(1);
  await expect(document.getByText("First floor", { exact: true })).toHaveCount(1);
  await expect(document).not.toContainText("PRIVATE STAFF NOTE");
  for (const content of [
    first.description,
    second.description,
    general.description,
    "Roof system",
  ]) {
    await expect(table).toContainText(content);
    await expect(document).toContainText(content);
  }
  const row = table
    .getByRole("row")
    .filter({ has: page.getByRole("button", { name: "עריכת פריט Lobby unit", exact: true }) })
    .first();
  const quantity = row.getByRole("spinbutton").first();
  const saved = page.waitForResponse(
    r => r.request().method() === "PUT" && r.url().endsWith("/quotation/" + quotation.id),
  );
  await quantity.fill("3");
  await expect(document.getByText("300.00", { exact: false }).first()).toBeVisible();
  expect((await saved).status()).toBe(200);
  const updated = await quotationDocument(await api.send("GET", "/quotation/" + quotation.id));
  expect(updated.totals.subtotal).toBe("650.00");
  expect(updated.sections.map(s => s.title)).toEqual([
    "Lobby system",
    "Office system",
    "Roof system",
    "Project services",
  ]);
  await page.reload();
  await expect(table.getByText("First floor", { exact: true })).toBeVisible();
  await editor.button("תצוגה").click();
  await expect(table.getByRole("spinbutton")).toHaveCount(0);
  await expect(document).toBeVisible();
  const download = page.waitForEvent("download");
  await editor.button("ייצוא PDF").click();
  const file = await download;
  const path = info.outputPath("mixed-quotation.pdf");
  await file.saveAs(path);
  const pdf = await getDocument({ data: new Uint8Array(await readFile(path)) }).promise;
  const texts = await Promise.all(
    Array.from({ length: pdf.numPages }, async (_, i) => {
      const content = await (await pdf.getPage(i + 1)).getTextContent();
      return content.items.map(item => ("str" in item ? item.str : "")).join(" ");
    }),
  );
  const text = texts.join(" ").replace(/\s+/g, " ");
  for (const expected of [
    "First floor",
    "Lobby system",
    "Office system",
    "Roof system",
    "Crane hire",
    "650.00",
  ])
    expect(text).toContain(expected);
  expect(text).not.toContain("PRIVATE STAFF NOTE");
  expect(text.indexOf("Lobby system")).toBeLessThan(text.indexOf("Office system"));
  expect(text.indexOf("Office system")).toBeLessThan(text.indexOf("Roof system"));
  await page.screenshot({ path: info.outputPath("desktop-view.png"), fullPage: true });
});

test("new system and floor can be added, renamed and reopened through the table", async ({
  api,
  page,
}) => {
  const customer = await seedCustomer(api);
  const quotation = await createQuotation(api, customer.id);
  const editor = createQuotationPage(page);
  await editor.goto(quotation.id);
  await editor.button("+ הוספת מערכת").click();
  const form = page.getByRole("form", { name: "הוספת מערכת", exact: true });
  await selectMuiOption(
    page,
    form.getByRole("combobox", { name: "חברה", exact: true }),
    QUOTATION.BRAND,
  );
  await selectMuiOption(page, form.getByRole("combobox", { name: "קומה", exact: true }), "new");
  await form.getByRole("textbox", { name: "שם הקומה החדשה", exact: true }).fill("Ground floor");
  await form.getByRole("textbox", { name: "כותרת מערכת", exact: true }).fill("Entrance");
  await editor.saved(() => form.getByRole("button", { name: "הוספה", exact: true }).click());
  await page.getByRole("button", { name: "עריכת קומה Ground floor", exact: true }).click();
  await page.getByRole("textbox", { name: "שם קומה", exact: true }).fill("Entrance floor");
  await editor.saved(() => editor.button("שמירה").click());
  await page.reload();
  const table = page.getByRole("table", { name: "פריטי ההצעה", exact: true });
  await expect(table).toContainText("Entrance floor");
  await expect(table).toContainText("Entrance");
  const saved = await quotationDocument(await api.send("GET", "/quotation/" + quotation.id));
  expect(saved.sections[0].floorName).toBe("Entrance floor");
  expect(saved.sections[0].floorId).toBeTruthy();
});

test("phone tabs preserve edits and legacy sections open without invented floor headings", async ({
  api,
  page,
}, info) => {
  const { quotation } = await fixture(api);
  const initial = await saveQuotation(api, quotation.id, {
    ...quotationWrite(quotation),
    sections: quotationWrite(quotation).sections.map(s => ({
      ...s,
      floorId: null,
      floorName: null,
    })),
  });
  await page.setViewportSize({ width: 390, height: 844 });
  const editor = createQuotationPage(page);
  await editor.goto(initial.id);
  const table = page.getByRole("table", { name: "פריטי ההצעה", exact: true });
  await expect(table).toBeVisible();
  await expect(table).not.toContainText("First floor");
  await expect(table).not.toContainText("No floor assigned");
  const quantity = table.getByRole("spinbutton").first();
  await editor.saved(() => quantity.fill("4"));
  await page.getByRole("tab", { name: "מסמך", exact: true }).click();
  const document = page.getByRole("article", { name: "מסמך ההצעה", exact: true });
  await expect(document).toBeVisible();
  await expect(table).toBeHidden();
  await expect(document).toContainText("400.00");
  await page.screenshot({ path: info.outputPath("phone-document.png") });
  await page.getByRole("tab", { name: "פריטים", exact: true }).click();
  await expect(quantity).toHaveValue("4");
  expect(await page.evaluate(() => window.document.documentElement.scrollWidth <= innerWidth)).toBe(
    true,
  );
  await page.screenshot({ path: info.outputPath("phone-items.png") });
});

test("failed save keeps the edited preview and can retry while metadata stays compact", async ({
  api,
  page,
}) => {
  const { quotation } = await fixture(api);
  const editor = createQuotationPage(page);
  await editor.goto(quotation.id);
  const table = page.getByRole("table", { name: "פריטי ההצעה", exact: true });
  const document = page.getByRole("article", { name: "מסמך ההצעה", exact: true });
  const endpoint = "**/quotation/" + quotation.id;
  await page.route(endpoint, async route => {
    if (route.request().method() === "PUT")
      await route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({ message: "QA save failure" }),
      });
    else await route.continue();
  });
  await table.getByRole("spinbutton").first().fill("5");
  await expect(page.getByRole("alert").filter({ hasText: "QA save failure" })).toBeVisible();
  await expect(page.getByRole("button", { name: /פרטי הצעה/ })).toHaveAttribute(
    "aria-expanded",
    "false",
  );
  await expect(document).toContainText("500.00");
  await page.unroute(endpoint);
  await editor.saved(() => editor.button("נסה לשמור שוב").click());
  const saved = await quotationDocument(await api.send("GET", "/quotation/" + quotation.id));
  expect(saved.sections[0].items[0].quantity).toBe("5.0000");
});

test("quotation read permission shows a read-only table and safe customer document", async ({
  api,
  openPageAs,
}) => {
  const { quotation } = await fixture(api);
  await withRolePermissions(USER_ROLES.ENGINEER, ["quotations.read"], async () => {
    const viewer = await openPageAs(TEST_USERS[USER_ROLES.ENGINEER]);
    await viewer.setViewportSize({ width: 1800, height: 1100 });
    await viewer.goto("/quotations/" + quotation.id);
    const table = viewer.getByRole("table", { name: "פריטי ההצעה", exact: true });
    await expect(table).toBeVisible();
    await expect(table.getByRole("spinbutton")).toHaveCount(0);
    await expect(viewer.getByRole("button", { name: "+ הוספת מערכת", exact: true })).toHaveCount(0);
    await expect(viewer.getByRole("button", { name: "עריכה", exact: true })).toHaveCount(0);
    const document = viewer.getByRole("article", { name: "מסמך ההצעה", exact: true });
    await expect(document).toBeVisible();
    await expect(document).toContainText("Lobby unit");
    await expect(document).not.toContainText("PRIVATE STAFF NOTE");
    await viewer.close();
  });
});
