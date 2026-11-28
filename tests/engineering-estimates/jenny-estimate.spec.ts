import {
  seedBuilding,
  seedCustomer,
  seedApartment,
  seedStandaloneProject,
} from "../../src/api/seed-data.ts";

import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import type { TGenAirApi } from "../../src/api/gen-air-api.ts";
import { createJennyPage } from "../../src/pages/jenny.page.ts";
import { isRecord } from "../../src/utilities/guard.utility.ts";
import { test, expect } from "../../src/fixtures/test.fixture.ts";
import type { APIResponse, Locator, Page } from "@playwright/test";
import { USER_ROLES } from "../../src/constants/user-role.constant.ts";
import { TEST_USERS } from "../../src/constants/test-users.constant.ts";
import { PERMISSIONS } from "../../src/constants/permission.constant.ts";
import { withRolePermissions } from "../../src/environment/role-permissions.ts";
import { HTTP_METHODS, HTTP_STATUS } from "../../src/constants/http.constant.ts";
import { createEstimateEditorPage } from "../../src/pages/estimate-editor.page.ts";
import { createCatalogueFixture } from "../../src/environment/quotation-fixtures.ts";
import { JENNY_DRIVE_PDF, registerJennyPdf } from "../../src/environment/jenny-drive-fixture.ts";

const ESTIMATES = "/engineering-estimates";
const NEW_ESTIMATE = "כתב כמויות חדש";
const ESTIMATE_NAME = "שם כתב הכמויות";
const ESTIMATE_TAB = "כתבי כמויות";
const CREATE_BILL = "יצירת כתב כמויות";
const EMPTY_BILLS = "עדיין אין כתבי כמויות בפרויקט זה";
const RETURN_TO_BILLS = "חזרה לכתבי הכמויות בפרויקט";
const projectBills = (id: string): string => `/projects/${id}?tab=estimates`;
const billPanel = (page: Page): Locator =>
  page.getByRole("tabpanel", { name: ESTIMATE_TAB, exact: true });
const PLANS_PROMPT = "אילו תוכניות נצרף לכתב הכמויות?";
const MOBILE = { width: 390, height: 844 };
const DESKTOP = { width: 1440, height: 900 };

interface IEstimateResponse extends Record<string, unknown> {
  id: string;
  version: number;
}

const estimatePath = (id: string): string => `${ESTIMATES}?estimate=${id}`;

const draftRow = (list: Locator, name: string): Locator =>
  list.getByRole("button", { name: `${name} · טיוטה`, exact: true });

const expectLargeHeading = async (heading: Locator, size: number): Promise<void> => {
  await expect(heading).toBeVisible();
  await expect(heading).toHaveCSS("direction", "rtl");
  await expect(heading).toHaveCSS("font-size", `${size}px`);
  await expect(heading).toHaveCSS("font-weight", "800");
};

const expectCompactEditActions = async (page: Page): Promise<void> => {
  const edit = page.getByRole("button", { name: "עריכת כתב כמויות", exact: true });
  const back = page.getByRole("button", { name: RETURN_TO_BILLS, exact: true });
  for (const action of [edit, back]) {
    await expect(action).toHaveCount(1);
    await expect(action).toBeInViewport({ ratio: 1 });
  }
  const [editBounds, backBounds] = await Promise.all(
    [edit, back].map(action =>
      action.evaluate(element => {
        const box = element.getBoundingClientRect();
        const label = document.createRange();
        label.selectNodeContents(element);
        const style = getComputedStyle(element);
        const inlineInsets = [
          style.paddingLeft,
          style.paddingRight,
          style.borderLeftWidth,
          style.borderRightWidth,
        ];
        const naturalWidth = inlineInsets.reduce(
          (sum, inset) => sum + parseFloat(inset),
          label.getBoundingClientRect().width,
        );
        return {
          left: box.left,
          right: box.right,
          top: box.top,
          height: box.height,
          width: box.width,
          naturalWidth,
        };
      }),
    ),
  );
  expect(Math.abs(editBounds.top - backBounds.top)).toBeLessThan(2);
  expect(editBounds.height).toBe(backBounds.height);
  const gap = Math.max(editBounds.left - backBounds.right, backBounds.left - editBounds.right);
  expect(gap).toBeGreaterThanOrEqual(0);
  expect(gap).toBeLessThanOrEqual(16);
  for (const bounds of [editBounds, backBounds]) {
    expect(Math.abs(bounds.width - bounds.naturalWidth)).toBeLessThan(2);
  }
};

const estimateResponse = async (
  response: APIResponse,
  expectedStatus: number,
): Promise<IEstimateResponse> => {
  expect(response.status(), `Estimate response at ${response.url()}`).toBe(expectedStatus);
  const value: unknown = await response.json();
  if (!isRecord(value) || typeof value.id !== "string" || typeof value.version !== "number") {
    throw new Error("Expected an estimate with a valid ID and revision");
  }
  return { ...value, id: value.id, version: value.version };
};

const estimateFromUrl = (page: Page): string => {
  const id = new URL(page.url()).searchParams.get("estimate");
  if (!id) {
    throw new Error("The saved estimate was not selected");
  }
  return id;
};

const readEstimate = async (api: TGenAirApi, id: string): Promise<IEstimateResponse> =>
  estimateResponse(await api.send(HTTP_METHODS.GET, `${ESTIMATES}/${id}`), HTTP_STATUS.OK);

const startJenny = async (
  page: Page,
  name: string,
  projectId: string,
): Promise<ReturnType<typeof createJennyPage>> => {
  const jenny = createJennyPage(page);
  await page.goto(projectBills(projectId));
  await page.getByRole("button", { name: CREATE_BILL, exact: true }).click();
  await expect(page.getByRole("form", { name: NEW_ESTIMATE, exact: true })).toBeVisible();
  await expect(jenny.launcher).toBeVisible();
  await expect(jenny.launcher).toHaveCSS("position", "fixed");
  const launcher = await jenny.launcher.boundingBox();
  const viewport = page.viewportSize();
  if (!launcher || !viewport) {
    throw new Error("Jenny launcher or viewport unavailable");
  }
  expect(launcher.x).toBeLessThan(50);
  expect(viewport.height - launcher.y - launcher.height).toBeLessThan(110);
  await jenny.launcher.click();
  const nameInput = jenny.dialog.getByLabel(ESTIMATE_NAME);
  const create = jenny.dialog.getByRole("button", { name: "יצירת טיוטה" });
  await expect(nameInput).toBeFocused();
  await expect(create).toBeDisabled();
  await nameInput.fill(name);
  await create.click();
  await expect(jenny.dialog.getByText("לאיזה פרויקט לשייך את כתב הכמויות?")).toBeVisible();
  return jenny;
};

const chooseOption = async (page: Page, field: Locator, name: string): Promise<void> => {
  await field.click();
  await page.getByRole("listbox").getByRole("option", { name, exact: true }).click();
};

const uploadPlan = (
  container: Page | Locator,
  name: string,
  mimeType: string,
  bytes: Buffer,
): Promise<void> =>
  container.locator('input[type="file"]').setInputFiles({ name, mimeType, buffer: bytes });

test("An engineer creates a project estimate and manages catalogue items without Jenny or area setup", async ({
  api: adminApi,
  apiAs,
  openPageAs,
}, testInfo) => {
  const name = "אומדן ידני עצמאי";
  const cancelledName = "אומדן שבוטל";
  const existingName = "אומדן הנדסי נוסף";
  const customer = await seedCustomer(adminApi);
  const project = await seedStandaloneProject(adminApi, customer);
  const otherProject = await seedStandaloneProject(adminApi, customer);
  const item = await createCatalogueFixture({ price: "25.0000" });
  const engineer = TEST_USERS[USER_ROLES.ENGINEER];
  const api = await apiAs(engineer);
  const page = await openPageAs(engineer);
  const jenny = createJennyPage(page);
  const start = page.getByRole("button", { name: CREATE_BILL, exact: true });
  const form = page.getByRole("form", { name: NEW_ESTIMATE, exact: true });
  const nameInput = form.getByRole("textbox", { name: ESTIMATE_NAME });
  const create = form.getByRole("button", { name: "יצירת כתב כמויות" });
  const estimateList = billPanel(page);

  await estimateResponse(
    await api.send(HTTP_METHODS.POST, ESTIMATES, {
      name: existingName,
      projectId: otherProject.id,
    }),
    HTTP_STATUS.CREATED,
  );
  await page.setViewportSize(DESKTOP);
  await page.goto(ESTIMATES);
  await expect(page).toHaveURL(/\/$/);
  await expect(
    page.getByRole("navigation").getByRole("button", { name: ESTIMATE_TAB, exact: true }),
  ).toHaveCount(0);
  await page.goto(`/projects/${project.id}`);
  await page.getByRole("tab", { name: ESTIMATE_TAB, exact: true }).click();
  await expect(estimateList.getByText(EMPTY_BILLS, { exact: true })).toBeVisible();
  await expect(estimateList.getByRole("heading")).toHaveCount(0);
  await expect(estimateList.getByText(existingName, { exact: true })).toHaveCount(0);
  await start.click();
  await expectLargeHeading(page.getByRole("heading", { name: NEW_ESTIMATE, exact: true }), 32);
  await expect(form.getByRole("combobox", { name: "פרויקט (אופציונלי)", exact: true })).toHaveCount(
    0,
  );
  await expect(nameInput).toBeFocused();
  await expect(create).toBeDisabled();
  await nameInput.fill("   ");
  await expect(create).toBeDisabled();
  await nameInput.fill(cancelledName);
  await form.getByRole("button", { name: "ביטול", exact: true }).click();
  await page.getByRole("button", { name: "יציאה ללא שמירה", exact: true }).click();
  await expect(form).toBeHidden();
  await expect(estimateList.getByText(EMPTY_BILLS, { exact: true })).toBeVisible();
  await expect(start).toBeFocused();

  await start.click();
  await expect(nameInput).toBeFocused();
  await testInfo.attach("manual-estimate-desktop-create", {
    body: await page.screenshot(),
    contentType: "image/png",
  });
  await expect(nameInput).toHaveValue("");
  await nameInput.fill(`  ${name}  `);
  await create.click();
  await expectLargeHeading(page.getByRole("heading", { name, exact: true }), 32);
  await expect(jenny.dialog).toBeHidden();
  const id = estimateFromUrl(page);
  const editor = createEstimateEditorPage(page);
  expect(await readEstimate(api, id)).toMatchObject({
    name,
    areas: [],
    lines: [],
    status: "draft",
    projectId: project.id,
  });
  await page.getByRole("button", { name: "עריכת כתב כמויות", exact: true }).click();
  await page.getByRole("button", { name: "הוספת פריט", exact: true }).click();
  await editor.selectCatalogueItem(editor.itemRows.first(), item.sku, item.description);
  await editor.itemRows.first().getByLabel("כמות לאזור אחד").fill("2");
  await expect(editor.document).toContainText("₪50.00");
  await page.getByRole("button", { name: "שמירת שינויים", exact: true }).click();
  await expect(page.getByRole("button", { name: "עריכת כתב כמויות", exact: true })).toBeVisible();
  await page.reload();
  await expect(editor.document).toContainText("₪50.00");
  await page.getByRole("button", { name: "עריכת כתב כמויות", exact: true }).click();
  await editor.itemRows.first().getByLabel("כמות לאזור אחד").fill("3");
  await expect(editor.document).toContainText("₪75.00");
  await page.getByRole("button", { name: "שמירת שינויים", exact: true }).click();
  await expect(page.getByRole("button", { name: "עריכת כתב כמויות", exact: true })).toBeVisible();
  await page.reload();
  await expect(editor.document).toContainText("₪75.00");
  await page.getByRole("button", { name: "עריכת כתב כמויות", exact: true }).click();
  await editor.itemRows.first().getByRole("button", { name: "הסרת פריט", exact: true }).click();
  await page.getByRole("button", { name: "שמירת שינויים", exact: true }).click();
  await expect(page.getByRole("button", { name: "עריכת כתב כמויות", exact: true })).toBeVisible();
  await page.reload();
  expect(await readEstimate(api, id)).toMatchObject({
    lines: [],
    areas: [expect.objectContaining({ name: "כללי", lines: [] })],
  });

  const additionalName = "אומדן לקומה השנייה";
  await estimateResponse(
    await api.send(HTTP_METHODS.POST, ESTIMATES, { name: additionalName, projectId: project.id }),
    HTTP_STATUS.CREATED,
  );
  await page.route(`**/engineering-estimates?*projectId=${project.id}*`, async route => {
    const url = new URL(route.request().url());
    url.searchParams.set("batchSize", "1");
    await route.continue({ url: url.toString() });
  });
  await page.getByRole("button", { name: RETURN_TO_BILLS }).click();
  const openEstimate = draftRow(estimateList, name);
  await expect(estimateList).toHaveCount(1);
  await expect(draftRow(estimateList, additionalName)).toBeVisible();
  await expect(openEstimate).toHaveCount(0);
  await estimateList.getByRole("button", { name: "טענו עוד" }).click();
  await expect(estimateList.getByText("טיוטה", { exact: true })).toHaveCount(2);
  await expect(openEstimate).toBeVisible();
  await expect(estimateList.getByText(name, { exact: true })).toBeVisible();
  await expect(draftRow(estimateList, existingName)).toHaveCount(0);
  await expect(draftRow(estimateList, cancelledName)).toHaveCount(0);
  await expect(start).toBeVisible();
  await expect(estimateList.getByRole("heading")).toHaveCount(0);
  await testInfo.attach("manual-estimate-list-card", {
    body: await page.screenshot(),
    contentType: "image/png",
  });
  await openEstimate.focus();
  await expect(openEstimate).toBeFocused();
  await openEstimate.press("Enter");
  await expect(page.getByRole("heading", { name, exact: true })).toBeVisible();
});

test("An engineer opens a linked bill and edits a saved estimate and its catalogue quantities without Jenny", async ({
  api,
  apiAs,
  openPageAs,
}, testInfo) => {
  const name = "אומדן ידני מקושר";
  const revisedName = "אומדן מקושר מעודכן";
  const area = "חדר ישיבות";
  const customer = await seedCustomer(api);
  const project = await seedStandaloneProject(api, customer);
  const item = await createCatalogueFixture({ price: "25.0000" });
  const engineer = TEST_USERS[USER_ROLES.ENGINEER];
  const engineerApi = await apiAs(engineer);
  const page = await openPageAs(engineer);
  const jenny = createJennyPage(page);
  const form = page.getByRole("form", { name: NEW_ESTIMATE, exact: true });

  await page.goto(projectBills(project.id));
  await page.getByRole("button", { name: CREATE_BILL, exact: true }).click();
  await form.getByRole("textbox", { name: ESTIMATE_NAME }).fill(name);
  await expect(form.getByRole("combobox", { name: "פרויקט (אופציונלי)", exact: true })).toHaveCount(
    0,
  );
  await form.getByRole("button", { name: "יצירת כתב כמויות" }).click();
  await expect(page.getByRole("heading", { name, exact: true })).toBeVisible();
  const id = estimateFromUrl(page);
  expect(await readEstimate(engineerApi, id)).toMatchObject({ projectId: project.id });

  await page.getByRole("button", { name: RETURN_TO_BILLS }).click();
  const estimateList = billPanel(page);
  await estimateList.getByText(name, { exact: true }).click();
  await expectLargeHeading(page.getByRole("heading", { name, exact: true }), 32);
  await expectCompactEditActions(page);
  await page.getByRole("button", { name: "עריכת כתב כמויות", exact: true }).click();
  await page.getByRole("textbox", { name: ESTIMATE_NAME }).fill(revisedName);
  await page.getByRole("button", { name: "הוספת אזור", exact: true }).click();
  const editor = createEstimateEditorPage(page);
  await editor.table.getByLabel("שם אזור או טיפוס").fill(area);
  await page.getByRole("button", { name: `הוספת פריט לאזור ${area}`, exact: true }).click();
  await editor.selectCatalogueItem(editor.itemRows.first(), item.sku, item.description);
  await editor.itemRows.first().getByLabel("כמות לאזור אחד").fill("2");
  await expect(editor.document).toContainText("₪50.00");
  await page.getByRole("button", { name: "שמירת שינויים", exact: true }).click();
  await expect(page.getByRole("button", { name: "עריכת כתב כמויות", exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("heading", { name: revisedName, exact: true })).toBeVisible();
  await expect(editor.document).toContainText("₪50.00");
  await expect(jenny.dialog).toBeHidden();
  expect(await readEstimate(engineerApi, id)).toMatchObject({
    name: revisedName,
    projectId: project.id,
    lines: [expect.objectContaining({ quantity: "2.0000", unitPrice: "25.0000", total: "50.00" })],
  });
  await testInfo.attach("manual-estimate-desktop-edit", {
    body: await page.screenshot(),
    contentType: "image/png",
  });
});

test("A narrow RTL project tab, create form and detail keep the name and status readable", async ({
  api,
  page,
}, testInfo) => {
  const name = "כתב כמויות למתחם מלונאות NorthWingMechanicalFloor2026";
  const customer = await seedCustomer(api);
  const project = await seedStandaloneProject(api, customer);
  await estimateResponse(
    await api.send(HTTP_METHODS.POST, ESTIMATES, { name, projectId: project.id }),
    HTTP_STATUS.CREATED,
  );
  await page.setViewportSize(MOBILE);
  await page.goto(projectBills(project.id));
  const list = billPanel(page);
  const row = draftRow(list, name);
  await expect(
    page.getByRole("navigation").getByRole("button", { name: ESTIMATE_TAB, exact: true }),
  ).toHaveCount(0);
  await expect(list.getByRole("heading")).toHaveCount(0);
  await expect(list).toHaveCSS("direction", "rtl");
  await expect(list.getByText(name, { exact: true })).toBeVisible();
  const status = list.getByText("טיוטה", { exact: true });
  await row.scrollIntoViewIfNeeded();
  await expect(status).toBeInViewport({ ratio: 1 });
  await expect(row).toBeInViewport();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(MOBILE.width);
  await testInfo.attach("manual-estimate-mobile-list", {
    body: await page.screenshot(),
    contentType: "image/png",
  });

  await page.getByRole("button", { name: CREATE_BILL, exact: true }).click();
  const form = page.getByRole("form", { name: NEW_ESTIMATE, exact: true });
  await expectLargeHeading(page.getByRole("heading", { name: NEW_ESTIMATE, exact: true }), 28);
  await expect(list).toBeHidden();
  await expect(form).toHaveCSS("direction", "rtl");
  await expect(form.getByRole("textbox", { name: ESTIMATE_NAME })).toBeFocused();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(MOBILE.width);
  await testInfo.attach("manual-estimate-mobile-create", {
    body: await page.screenshot(),
    contentType: "image/png",
  });
  await form.getByRole("button", { name: "ביטול", exact: true }).click();

  await list.getByText(name, { exact: true }).click();
  await expectLargeHeading(page.getByRole("heading", { name, exact: true }), 28);
  await expect(createEstimateEditorPage(page).document).toBeVisible();
  await expectCompactEditActions(page);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(MOBILE.width);
  await testInfo.attach("manual-estimate-mobile-detail", {
    body: await page.screenshot(),
    contentType: "image/png",
  });
  const edit = page.getByRole("button", { name: "עריכת כתב כמויות", exact: true });
  await edit.click();
  await expect(edit).toHaveCount(0);
  await page.getByRole("button", { name: "ביטול עריכה", exact: true }).click();
  await expect(edit).toBeVisible();
  await page.getByRole("button", { name: RETURN_TO_BILLS, exact: true }).click();
  await expect(row).toBeVisible();
});

test("Building and apartment bills use their own project, recover from load errors and follow read-only grants", async ({
  api,
  apiAs,
  openPageAs,
  page,
}) => {
  const customer = await seedCustomer(api);
  const building = await seedBuilding(api, customer);
  const apartment = await seedApartment(api, building);
  const buildingName = "מפרט הבניין";
  const apartmentName = "מפרט הדירה";
  for (const [projectId, name] of [
    [building.id, buildingName],
    [apartment.id, apartmentName],
  ]) {
    await estimateResponse(
      await api.send(HTTP_METHODS.POST, ESTIMATES, { name, projectId }),
      HTTP_STATUS.CREATED,
    );
  }
  await page.goto(projectBills(building.id));
  await expect(draftRow(billPanel(page), buildingName)).toBeVisible();
  await expect(draftRow(billPanel(page), apartmentName)).toHaveCount(0);
  const apartmentEndpoint = `**/engineering-estimates?*projectId=${apartment.id}*`;
  await page.route(apartmentEndpoint, route =>
    route.fulfill({ status: 503, json: { message: "שגיאה בטעינה" } }),
  );
  await page.goto(projectBills(apartment.id));
  await expect(page).toHaveURL(
    new RegExp(`/projects/${building.id}/apartments/${apartment.id}\\?tab=estimates$`),
  );
  const panel = billPanel(page);
  await expect(panel.getByRole("button", { name: "נסו שוב" })).toBeVisible();
  await expect(panel.getByText(EMPTY_BILLS)).toHaveCount(0);
  await page.unroute(apartmentEndpoint);
  await panel.getByRole("button", { name: "נסו שוב" }).click();
  const card = draftRow(panel, apartmentName);
  await expect(card).toBeVisible();
  await expect(draftRow(panel, buildingName)).toHaveCount(0);
  await panel.getByText(apartmentName, { exact: true }).click();
  await expect(page.getByRole("heading", { name: apartmentName, exact: true })).toBeVisible();
  await page.getByRole("button", { name: RETURN_TO_BILLS }).click();
  await expect(card).toBeVisible();
  const role = USER_ROLES.ENGINEER;
  const engineer = await apiAs(TEST_USERS[role]);
  const ownBill = await estimateResponse(
    await engineer.send(HTTP_METHODS.POST, ESTIMATES, {
      name: "כתב כמויות לקריאה",
      projectId: apartment.id,
    }),
    HTTP_STATUS.CREATED,
  );
  await withRolePermissions(
    role,
    engineer.session.user.permissions.filter(
      key => key !== PERMISSIONS.ENGINEERING_ESTIMATES_MANAGE,
    ),
    async () => {
      const readOnly = await openPageAs(TEST_USERS[role]);
      await readOnly.goto(projectBills(building.id));
      await expect(billPanel(readOnly).getByText(EMPTY_BILLS, { exact: true })).toBeVisible();
      await expect(readOnly.getByRole("button", { name: CREATE_BILL })).toHaveCount(0);
      await readOnly.goto(estimatePath(ownBill.id));
      await expect(
        readOnly.getByRole("heading", { name: "כתב כמויות לקריאה", exact: true }),
      ).toBeVisible();
      await expect(
        readOnly.getByRole("button", { name: "עריכת כתב כמויות", exact: true }),
      ).toHaveCount(0);
      await readOnly.getByRole("button", { name: RETURN_TO_BILLS, exact: true }).click();
      await expect(draftRow(billPanel(readOnly), "כתב כמויות לקריאה")).toBeVisible();
    },
  );
});

test("Jenny resumes a project’s RTL mobile draft with uploaded plans, repeatable areas and catalogue pricing", async ({
  api,
  page,
}, testInfo) => {
  const item = await createCatalogueFixture({ price: "25.0000" });
  const sourcePlan = "qa-source.pdf";
  const area = "חדר מלון";
  const provenance = "QA FLOOR 2";
  await page.setViewportSize(MOBILE);
  await page.emulateMedia({ reducedMotion: "reduce" });
  const project = await seedStandaloneProject(api, await seedCustomer(api));
  const jenny = await startJenny(page, "אומדן לפרויקט לבדיקות", project.id);
  await expect(jenny.dialog).toHaveAttribute("aria-modal", "true");
  await expect(jenny.dialog).toHaveCSS("direction", "rtl");
  await expect(jenny.dialog).toHaveCSS("width", `${MOBILE.width}px`);
  await expect(jenny.dialog).toHaveCSS("height", `${MOBILE.height}px`);
  const id = estimateFromUrl(page);
  await jenny.dialog.getByRole("button", { name: "המשך לתוכניות" }).click();
  await expect(jenny.dialog.getByText(PLANS_PROMPT)).toBeVisible();
  await uploadPlan(jenny.dialog, sourcePlan, "application/pdf", JENNY_DRIVE_PDF);
  await expect(jenny.dialog.getByRole("button", { name: sourcePlan })).toBeVisible();

  await page.keyboard.press("Escape");
  await expect(jenny.dialog).toBeHidden();
  await expect(jenny.launcher).toBeFocused();
  await page.reload();
  await jenny.launcher.click();
  await expect(jenny.dialog.getByText(PLANS_PROMPT)).toBeVisible();
  await expect(jenny.dialog.getByRole("button", { name: sourcePlan })).toBeVisible();
  await testInfo.attach("jenny-mobile-resume", {
    body: await jenny.dialog.screenshot(),
    contentType: "image/png",
  });

  await jenny.dialog.getByRole("button", { name: "המשך להיקף העבודה" }).click();
  await expect(jenny.dialog.getByText("מה היקף העבודה?")).toBeVisible();
  await chooseOption(
    page,
    jenny.dialog.getByRole("combobox", { name: "היקף עבודה" }),
    "מיזוג ואוורור",
  );
  await jenny.dialog.getByRole("button", { name: "המשך להגדרת אזורים" }).click();
  const finish = jenny.dialog.getByRole("button", { name: "סיום ההגדרה" });
  await expect(finish).toBeDisabled();
  await jenny.dialog.getByLabel("שם אזור או טיפוס").fill(area);
  await jenny.dialog.getByLabel("מספר חזרות").fill("3");
  await jenny.dialog.getByRole("button", { name: "הוספת אזור" }).click();
  await expect(jenny.dialog.getByText(`${area} · 3 יחידות`)).toBeVisible();
  await finish.click();
  await jenny.dialog.getByRole("button", { name: "עריכת כמויות ותמחור" }).click();
  await expect(jenny.dialog).toBeHidden();

  await page.getByRole("button", { name: "עריכת כתב כמויות", exact: true }).click();
  const editor = createEstimateEditorPage(page);
  await page.getByRole("button", { name: `הוספת פריט לאזור ${area}`, exact: true }).click();
  await editor.selectCatalogueItem(editor.itemRows.first(), item.sku, item.description);
  await editor.itemRows.first().getByLabel("כמות לאזור אחד").fill("2");
  await editor.itemRows.first().getByRole("button", { name: "מדידות וכללים" }).click();
  const details = await editor.details(editor.itemRows.first());
  await details.getByLabel("מקור המדידה (אופציונלי)").fill(provenance);
  await page.getByRole("button", { name: "שמירת שינויים", exact: true }).click();
  await expect(page.getByRole("button", { name: "עריכת כתב כמויות", exact: true })).toBeVisible();
  const row = editor.document.getByRole("row").filter({ hasText: item.sku });
  await expect(row).toContainText("6.0000");
  await expect(row).toContainText("₪150.00");
  await page.reload();
  await expect(row).toContainText("₪150.00");
  const viewportWidth = await page.evaluate(() => document.documentElement.scrollWidth);
  expect(viewportWidth).toBe(MOBILE.width);
  expect(await readEstimate(api, id)).toMatchObject({
    projectId: project.id,
    scope: "hvac_ventilation",
    areas: [expect.objectContaining({ lines: [expect.objectContaining({ source: provenance })] })],
    setupStep: "complete",
    plans: [expect.objectContaining({ name: sourcePlan, marked: false })],
    lines: [expect.objectContaining({ quantity: "6.0000", unitPrice: "25.0000", total: "150.00" })],
  });
});

test("Jenny copies a plan only from the selected project and enforces private estimate access", async ({
  api,
  apiAs,
  openPageAs,
}) => {
  const engineer = TEST_USERS[USER_ROLES.ENGINEER];
  const engineerApi = await apiAs(engineer);
  const financeApi = await apiAs(TEST_USERS[USER_ROLES.FINANCE]);
  const customer = await seedCustomer(api);
  const project = await seedStandaloneProject(api, customer);
  const otherProject = await seedStandaloneProject(api, customer);
  const provisions = await Promise.all(
    [project, otherProject].map(async ({ id }) => {
      const response = await api.send(HTTP_METHODS.POST, `/project-drive/${id}/provision`);
      expect(response.status()).toBe(HTTP_STATUS.CREATED);
      const body: unknown = await response.json();
      if (!isRecord(body) || typeof body.driveFolderId !== "string") {
        throw new Error("Disposable Drive folder did not provision");
      }
      return body.driveFolderId;
    }),
  );
  const [root, otherRoot] = provisions;
  if (!root || !otherRoot) {
    throw new Error("Expected two disposable Drive folders");
  }
  const allowed = await registerJennyPdf(root, "approved-source.pdf");
  const foreign = await registerJennyPdf(otherRoot, "unrelated-source.pdf");

  const page = await openPageAs(engineer);
  const jenny = await startJenny(page, "אומדן לפרויקט", project.id);
  await expect(jenny.dialog).toHaveAttribute("aria-modal", "false");
  await jenny.dialog.getByRole("button", { name: "המשך לתוכניות" }).click();
  await expect(jenny.dialog.getByText(PLANS_PROMPT)).toBeVisible();
  await jenny.dialog.getByRole("button", { name: "בחירה מקובצי הפרויקט" }).click();
  await jenny.dialog.getByRole("button", { name: "מפרטים", exact: true }).click();
  await jenny.dialog.getByRole("button", { name: `צירוף ${allowed.name}` }).click();
  const download = page.waitForEvent("download");
  await jenny.dialog.getByRole("button", { name: allowed.name, exact: true }).click();
  expect(await readFile(await (await download).path())).toEqual(JENNY_DRIVE_PDF);
  await expect(jenny.dialog.getByText(foreign.name)).toHaveCount(0);

  const id = estimateFromUrl(page);
  const saved = await readEstimate(engineerApi, id);
  expect(saved).toMatchObject({
    projectId: project.id,
    plans: [expect.objectContaining({ name: allowed.name })],
  });
  const link = await engineerApi.send(HTTP_METHODS.POST, `${ESTIMATES}/${id}/plans/link`, {
    version: saved.version,
    fileId: foreign.id,
  });
  expect(link.status()).toBe(HTTP_STATUS.NOT_FOUND);
  expect(await readEstimate(engineerApi, id)).toEqual(saved);
  await jenny.dialog.getByRole("button", { name: "המשך להיקף העבודה" }).click();
  await expect(jenny.dialog.getByText("מה היקף העבודה?")).toBeVisible();
  expect(await readEstimate(engineerApi, id)).toMatchObject({
    setupStep: "scope",
    projectId: project.id,
    plans: saved.plans,
  });
  expect((await financeApi.send(HTTP_METHODS.GET, `${ESTIMATES}/${id}`)).status()).toBe(
    HTTP_STATUS.FORBIDDEN,
  );
  const financePage = await openPageAs(TEST_USERS[USER_ROLES.FINANCE]);
  await financePage.goto(projectBills(project.id));
  await expect(financePage.getByRole("tab", { name: ESTIMATE_TAB, exact: true })).toHaveCount(0);
  await financePage.goto(ESTIMATES);
  await expect(financePage.getByText("אין הרשאה לפעולה זו")).toBeVisible();
  await expect(financePage.getByRole("button", { name: NEW_ESTIMATE, exact: true })).toHaveCount(0);
  await financePage.goto(estimatePath(id));
  await expect(financePage.getByText("אין הרשאה לפעולה זו")).toBeVisible();
  await expect(createJennyPage(financePage).launcher).toHaveCount(0);
  await expect(financePage.getByText("אומדן לפרויקט", { exact: true })).toHaveCount(0);
});

test("Unpriced rule quantities remain visible and prevent approvals and customer output", async ({
  api,
  page,
}) => {
  const item = await createCatalogueFixture({ price: "25.0000" });
  const fixture = await estimateResponse(
    await api.send(HTTP_METHODS.POST, ESTIMATES, {
      name: "אומדן עם מק״ט לא מתומחר",
    }),
    HTTP_STATUS.CREATED,
  );
  const path = `${ESTIMATES}/${fixture.id}`;
  const missingSku = `QA-MISSING-${randomUUID()}`;
  const area = {
    id: randomUUID(),
    name: "חדר חוזר",
    repeatCount: 3,
    lines: [
      {
        id: randomUUID(),
        catalogueItemId: item.id,
        quantity: "2",
        measurements: {
          equipment: "other",
          pipeMetresIncludingRise: 0,
          shelterSupply: false,
          distribution: { kind: "duct", catalogueCode: missingSku, metres: 2, bends: 1 },
        },
      },
    ],
  };
  const draft = await estimateResponse(
    await api.send(HTTP_METHODS.PATCH, path, {
      version: fixture.version,
      setupStep: "complete",
      areas: [area],
    }),
    HTTP_STATUS.OK,
  );
  expect(draft).toMatchObject({
    lines: expect.arrayContaining([
      expect.objectContaining({
        sku: missingSku,
        quantity: "21.6000",
        unitPrice: null,
        total: null,
      }),
    ]),
  });
  await page.goto(estimatePath(fixture.id));
  const missing = page.getByRole("row").filter({ hasText: missingSku });
  await expect(missing.getByText("חסר מחיר", { exact: true })).toBeVisible();
  expect(
    (await api.send(HTTP_METHODS.POST, `${path}/approve`, { version: draft.version })).status(),
  ).toBe(HTTP_STATUS.CONFLICT);
  expect((await api.send(HTTP_METHODS.GET, `${path}/proposal`)).status()).toBe(
    HTTP_STATUS.CONFLICT,
  );
});
