import { randomUUID } from "node:crypto";
import { isRecord } from "../../src/utilities/guard.utility.ts";
import { test, expect } from "../../src/fixtures/test.fixture.ts";
import { USER_ROLES } from "../../src/constants/user-role.constant.ts";
import { TEST_USERS } from "../../src/constants/test-users.constant.ts";
import { HTTP_METHODS, HTTP_STATUS } from "../../src/constants/http.constant.ts";
import { createEstimateEditorPage } from "../../src/pages/estimate-editor.page.ts";
import { createCatalogueFixture } from "../../src/environment/quotation-fixtures.ts";

const ESTIMATES = "/engineering-estimates";

const draftAreas = (catalogueItemId: string, accessoryCode: string) => [
  {
    id: randomUUID(),
    name: "דירה טיפוסית",
    repeatCount: 3,
    lines: [
      {
        id: randomUUID(),
        catalogueItemId,
        quantity: "2",
        measurements: {
          equipment: "other",
          pipeMetresIncludingRise: 0,
          shelterSupply: false,
          distribution: { kind: "duct", catalogueCode: accessoryCode, metres: 2, bends: 1 },
        },
      },
    ],
  },
];

test("Draft calculation is authorized, calculates accessories without persistence, and first save retains the reviewed rows", async ({
  api,
  apiAs,
}) => {
  const equipment = await createCatalogueFixture({ price: "25.0000" });
  const accessory = await createCatalogueFixture({ price: "10.0000" });
  const areas = draftAreas(equipment.id, accessory.sku);
  const input = { scope: "hvac", areas };
  const before = await api.send(HTTP_METHODS.GET, ESTIMATES);
  const originalList: unknown = await before.json();
  const preview = await api.send(HTTP_METHODS.POST, `${ESTIMATES}/preview`, input);
  expect(preview.status()).toBe(HTTP_STATUS.OK);
  const calculated: unknown = await preview.json();
  if (!isRecord(calculated)) {
    throw new Error("Expected a calculated document");
  }

  expect(calculated).toMatchObject({
    subtotal: "366.00",
    lines: expect.arrayContaining([
      expect.objectContaining({ sku: equipment.sku, quantity: "6.0000", total: "150.00" }),
      expect.objectContaining({
        sku: accessory.sku,
        source: "rule",
        quantity: "21.6000",
        total: "216.00",
      }),
    ]),
  });
  expect(await (await api.send(HTTP_METHODS.GET, ESTIMATES)).json()).toEqual(originalList);
  const finance = await apiAs(TEST_USERS[USER_ROLES.FINANCE]);
  expect((await finance.send(HTTP_METHODS.POST, `${ESTIMATES}/preview`, input)).status()).toBe(
    HTTP_STATUS.FORBIDDEN,
  );
  const created = await api.send(HTTP_METHODS.POST, ESTIMATES, {
    name: `Reviewed draft ${randomUUID()}`,
    ...input,
  });
  expect(created.status()).toBe(HTTP_STATUS.CREATED);
  expect(await created.json()).toMatchObject({ version: 1, areas, ...calculated });
});

test("Grouped catalogue editing previews quantities and prices before create and saves edits across areas as one revision", async ({
  api,
  page,
}, testInfo) => {
  const equipment = await createCatalogueFixture({ price: "25.0000" });
  const duct = await createCatalogueFixture({ price: "10.0000" });
  const name = `טיוטה חיה ${randomUUID()}`;
  const editor = createEstimateEditorPage(page);
  await page.setViewportSize({ width: 1680, height: 1000 });
  await page.goto(ESTIMATES);
  await page.getByRole("button", { name: "כתב כמויות חדש", exact: true }).click();
  await page.getByRole("textbox", { name: "שם כתב הכמויות" }).fill(name);
  await page.getByRole("button", { name: "הוספת אזור", exact: true }).click();
  await editor.table.getByLabel("שם אזור או טיפוס").fill("דירה טיפוסית");
  await editor.table.getByLabel("מספר חזרות").fill("3");
  await page.getByRole("button", { name: "הוספת פריט לאזור דירה טיפוסית", exact: true }).click();
  const apartment = editor.itemRows.nth(0);
  const apartmentDetails = await editor.details(apartment);
  await editor.selectCatalogueItem(apartment, equipment.sku, equipment.description);
  await apartment.getByLabel("כמות לאזור אחד").fill("2");
  await expect(apartmentDetails.getByLabel("מקור המדידה (אופציונלי)")).toBeHidden();
  await apartment.getByRole("button", { name: "מדידות וכללים" }).click();
  await apartmentDetails.getByLabel("מקור המדידה (אופציונלי)").fill("תוכנית קומה 2");
  await apartmentDetails.getByRole("button", { name: "הוספת מדידות לחישוב לפי כללים" }).click();
  await apartmentDetails.getByRole("combobox", { name: "פיזור אוויר", exact: true }).click();
  await page.getByRole("option", { name: "תעלת פח", exact: true }).click();
  await apartmentDetails.getByLabel("מק״ט תעלת פח בקטלוג").fill(duct.sku);
  await apartmentDetails.getByLabel("אורך תעלה במטרים").fill("2");
  await apartmentDetails.getByLabel("מספר כיפופי תעלה").fill("1");
  const equipmentRow = editor.document.getByRole("row").filter({ hasText: equipment.sku });
  const ductRow = editor.document.getByRole("row").filter({ hasText: duct.sku });
  await expect(equipmentRow).toContainText("6.0000");
  await expect(equipmentRow).toContainText("₪150.00");
  await expect(ductRow).toContainText("21.6000");
  await expect(ductRow).toContainText("₪216.00");
  await apartment.getByRole("button", { name: "מדידות וכללים" }).click();
  await expect(apartmentDetails.getByLabel("מקור המדידה (אופציונלי)")).toBeHidden();
  await page.getByRole("button", { name: "הוספת אזור", exact: true }).click();
  await editor.table.getByLabel("שם אזור או טיפוס").nth(1).fill("לובי");
  await page.getByRole("button", { name: "הוספת פריט לאזור לובי", exact: true }).click();
  const lobby = editor.itemRows.nth(1);
  await editor.selectCatalogueItem(lobby, equipment.sku, equipment.description);
  await lobby.getByLabel("כמות לאזור אחד").fill("1");
  await expect(editor.document).toContainText("₪391.00");
  await testInfo.attach("boq-live-preview-desktop", {
    body: await page.screenshot({ fullPage: true }),
    contentType: "image/png",
  });
  await page.getByRole("button", { name: "יצירת כתב כמויות", exact: true }).click();
  await expect(page.getByRole("button", { name: "עריכת כתב כמויות", exact: true })).toBeVisible();
  const id = new URL(page.url()).searchParams.get("estimate");
  expect(id).toBeTruthy();
  const saved = await (await api.send(HTTP_METHODS.GET, `${ESTIMATES}/${id}`)).json();
  expect(saved).toMatchObject({ version: 1, subtotal: "391.00" });
  await page.getByRole("button", { name: "עריכת כתב כמויות", exact: true }).click();
  const reopenedDetails = await editor.details(editor.itemRows.nth(0));
  await editor.itemRows.nth(0).getByRole("button", { name: "מדידות וכללים" }).click();
  await expect(reopenedDetails.getByLabel("מקור המדידה (אופציונלי)")).toHaveValue("תוכנית קומה 2");
  await expect(reopenedDetails.getByLabel("אורך תעלה במטרים")).toHaveValue("2");
  await expect(reopenedDetails.getByLabel("מספר כיפופי תעלה")).toHaveValue("1");
  await editor.itemRows.nth(0).getByLabel("כמות לאזור אחד").fill("3");
  await editor.itemRows.nth(1).getByLabel("כמות לאזור אחד").fill("2");
  await expect(editor.document).toContainText("₪599.00");
  expect(await (await api.send(HTTP_METHODS.GET, `${ESTIMATES}/${id}`)).json()).toMatchObject({
    version: 1,
    subtotal: "391.00",
  });
  await page.getByRole("button", { name: "שמירת שינויים", exact: true }).click();
  await expect(page.getByRole("button", { name: "עריכת כתב כמויות", exact: true })).toBeVisible();
  await page.reload();
  await expect(editor.document).toContainText("₪599.00");
  await expect(editor.table).toHaveCount(0);
  expect(await (await api.send(HTTP_METHODS.GET, `${ESTIMATES}/${id}`)).json()).toMatchObject({
    version: 2,
    subtotal: "599.00",
  });
});

test("Mobile editor and document switching keeps draft values and contains horizontal overflow", async ({
  page,
}, testInfo) => {
  const item = await createCatalogueFixture({ price: "25.0000" });
  const editor = createEstimateEditorPage(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(ESTIMATES);
  await page.getByRole("button", { name: "כתב כמויות חדש", exact: true }).click();
  await page.getByRole("textbox", { name: "שם כתב הכמויות" }).fill("בדיקת תצוגה בנייד");
  await page.getByRole("button", { name: "הוספת פריט", exact: true }).click();
  await editor.selectCatalogueItem(editor.itemRows.first(), item.sku, item.description);
  await editor.itemRows.first().getByLabel("כמות לאזור אחד").fill("2");
  await editor.itemRows.first().getByRole("button", { name: "מדידות וכללים" }).click();
  const mobileDetails = await editor.details(editor.itemRows.first());
  await mobileDetails.getByLabel("מקור המדידה (אופציונלי)").fill("הפניה שמורה");
  const tabs = page.getByRole("group", { name: "עורך ותצוגה מקדימה" });
  await tabs.getByRole("button", { name: "תצוגה מקדימה", exact: true }).click();
  await expect(editor.document).toBeVisible();
  await expect(editor.document).toContainText("₪50.00");
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
  await testInfo.attach("boq-live-preview-mobile", {
    body: await page.screenshot({ fullPage: true }),
    contentType: "image/png",
  });
  await tabs.getByRole("button", { name: "עריכה", exact: true }).click();
  await expect(editor.itemRows.first().getByLabel("כמות לאזור אחד")).toHaveValue("2");
  await expect(mobileDetails.getByLabel("מקור המדידה (אופציונלי)")).toHaveValue("הפניה שמורה");
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
  await testInfo.attach("boq-grouped-editor-mobile", {
    body: await page.screenshot({ fullPage: true }),
    contentType: "image/png",
  });
});

test("Duplicate SKU rows remain independently editable and a conflicting save retains the working draft", async ({
  api,
  page,
}) => {
  const item = await createCatalogueFixture({ price: "25.0000" });
  const first = { id: randomUUID(), catalogueItemId: item.id, quantity: "2" };
  const second = { id: randomUUID(), catalogueItemId: item.id, quantity: "5" };
  const areas = [{ id: randomUUID(), name: "לובי", repeatCount: 1, lines: [first, second] }];
  const created = await api.send(HTTP_METHODS.POST, ESTIMATES, {
    name: `Concurrent ${randomUUID()}`,
    areas,
  });
  expect(created.status()).toBe(HTTP_STATUS.CREATED);
  const saved: unknown = await created.json();
  if (!isRecord(saved) || typeof saved.id !== "string" || typeof saved.version !== "number") {
    throw new Error("Expected a saved estimate identity");
  }
  const editor = createEstimateEditorPage(page);
  await page.setViewportSize({ width: 1680, height: 1000 });
  await page.goto(`${ESTIMATES}?estimate=${saved.id}`);
  await page.getByRole("button", { name: "עריכת כתב כמויות", exact: true }).click();
  await editor.itemRows.nth(1).getByLabel("כמות לאזור אחד").fill("7");
  await editor.itemRows.nth(0).getByRole("button", { name: "הסרת פריט", exact: true }).click();
  await expect(editor.itemRows).toHaveCount(1);
  await expect(editor.itemRows.first().getByLabel("כמות לאזור אחד")).toHaveValue("7");
  await expect(editor.document).toContainText("₪175.00");
  const concurrent = await api.send(HTTP_METHODS.PATCH, `${ESTIMATES}/${saved.id}`, {
    version: saved.version,
    name: `Updated elsewhere ${randomUUID()}`,
  });
  expect(concurrent.status()).toBe(HTTP_STATUS.OK);
  await page.getByRole("button", { name: "שמירת שינויים", exact: true }).click();
  await expect(page.getByText("השינויים שלכם נשמרו בעורך", { exact: false })).toBeVisible();
  await expect(editor.itemRows.first().getByLabel("כמות לאזור אחד")).toHaveValue("7");
  const persisted: unknown = await (
    await api.send(HTTP_METHODS.GET, `${ESTIMATES}/${saved.id}`)
  ).json();
  expect(persisted).toMatchObject({ version: saved.version + 1, areas });
});
