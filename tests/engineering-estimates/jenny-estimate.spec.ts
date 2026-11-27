import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import type { TGenAirApi } from "../../src/api/gen-air-api.ts";
import { createJennyPage } from "../../src/pages/jenny.page.ts";
import { isRecord } from "../../src/utilities/guard.utility.ts";
import { test, expect } from "../../src/fixtures/test.fixture.ts";
import type { APIResponse, Locator, Page } from "@playwright/test";
import { getDocument, OPS } from "pdfjs-dist/legacy/build/pdf.mjs";
import { QUOTATION } from "../../src/constants/quotation.constant.ts";
import { USER_ROLES } from "../../src/constants/user-role.constant.ts";
import { PAYMENT_TERMS } from "../../src/constants/domain.constant.ts";
import { TEST_USERS } from "../../src/constants/test-users.constant.ts";
import { seedCustomer, seedStandaloneProject } from "../../src/api/seed-data.ts";
import { HTTP_METHODS, HTTP_STATUS } from "../../src/constants/http.constant.ts";
import { createCatalogueFixture } from "../../src/environment/quotation-fixtures.ts";
import { JENNY_DRIVE_PDF, registerJennyPdf } from "../../src/environment/jenny-drive-fixture.ts";
import { quotationDocument, quotationWrite, saveQuotation } from "../../src/api/quotation.api.ts";

const ESTIMATES = "/engineering-estimates";
const NEW_ESTIMATE = "כתב כמויות חדש";
const ESTIMATE_NAME = "שם כתב הכמויות";
const ESTIMATE_LIST = "רשימת כתבי כמויות";
const PLANS_PROMPT = "אילו תוכניות נצרף לכתב הכמויות?";
const CUSTOMER_PDF = "הורדת הצעה ללקוח (PDF)";
const SKETCH = "הפקת סקיצה לאישור";
const MARKED_PLAN = "internal-marked-plan.png";
const MOBILE = { width: 390, height: 844 };

interface IEstimateResponse extends Record<string, unknown> {
  id: string;
  version: number;
}

interface IPdfContent {
  text: string;
  images: number;
}

const estimatePath = (id: string): string => `${ESTIMATES}?estimate=${id}`;

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
): Promise<ReturnType<typeof createJennyPage>> => {
  const jenny = createJennyPage(page);
  await page.goto(ESTIMATES);
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

const searchOptions = async (page: Page, name: string, query: string): Promise<void> => {
  await page.getByRole("combobox", { name, exact: true }).click();
  const search = page.getByRole("dialog", { name, exact: true });
  await search.getByRole("combobox", { name, exact: true }).fill(query);
};

const uploadPlan = (
  container: Page | Locator,
  name: string,
  mimeType: string,
  bytes: Buffer,
): Promise<void> =>
  container.locator('input[type="file"]').setInputFiles({ name, mimeType, buffer: bytes });

const capturePdf = async (page: Page, button: string): Promise<Buffer> => {
  const downloaded = page.waitForEvent("download");
  await page.getByRole("button", { name: button, exact: true }).click();
  const file = await downloaded;
  const bytes = await readFile(await file.path());
  expect(bytes.subarray(0, 5).toString()).toBe("%PDF-");
  return bytes;
};

const inspectPdf = async (bytes: Buffer): Promise<IPdfContent> => {
  const document = await getDocument({ data: new Uint8Array(bytes) }).promise;
  try {
    const pages = await Promise.all(
      Array.from({ length: document.numPages }, async (_, index) => {
        const page = await document.getPage(index + 1);
        const [text, operators] = await Promise.all([
          page.getTextContent(),
          page.getOperatorList(),
        ]);
        const images = operators.fnArray.filter(
          operator =>
            operator === OPS.paintImageXObject || operator === OPS.paintInlineImageXObject,
        ).length;
        return { images, text: text.items.map(item => ("str" in item ? item.str : "")).join(" ") };
      }),
    );
    return {
      images: pages.reduce((count, page) => count + page.images, 0),
      text: pages
        .map(page => page.text)
        .join("")
        .replace(/\s+/g, ""),
    };
  } finally {
    await document.destroy();
  }
};

test("An engineer creates a standalone estimate and manages catalogue items without Jenny or area setup", async ({
  apiAs,
  openPageAs,
}, testInfo) => {
  const name = "אומדן ידני עצמאי";
  const cancelledName = "אומדן שבוטל";
  const existingName = "אומדן הנדסי נוסף";
  const item = await createCatalogueFixture({ price: "25.0000" });
  const engineer = TEST_USERS[USER_ROLES.ENGINEER];
  const api = await apiAs(engineer);
  const page = await openPageAs(engineer);
  const jenny = createJennyPage(page);
  const start = page.getByRole("button", { name: NEW_ESTIMATE, exact: true });
  const form = page.getByRole("form", { name: NEW_ESTIMATE, exact: true });
  const nameInput = form.getByRole("textbox", { name: ESTIMATE_NAME });
  const create = form.getByRole("button", { name: "יצירת כתב כמויות" });

  await estimateResponse(
    await api.send(HTTP_METHODS.POST, ESTIMATES, { name: existingName }),
    HTTP_STATUS.CREATED,
  );
  await page.goto(ESTIMATES);
  await expect(jenny.launcher).toBeVisible();
  await start.click();
  await expect(nameInput).toBeFocused();
  await expect(create).toBeDisabled();
  await nameInput.fill("   ");
  await expect(create).toBeDisabled();
  await nameInput.fill(cancelledName);
  await form.getByRole("button", { name: "ביטול", exact: true }).click();
  await expect(form).toBeHidden();
  await expect(start).toBeFocused();

  await start.click();
  await expect(nameInput).toHaveValue("");
  await nameInput.fill(`  ${name}  `);
  await create.click();
  await expect(page.getByRole("heading", { name, exact: true })).toBeVisible();
  await expect(page.getByRole("combobox", { name: "בחירת פריט מהקטלוג" })).toBeEnabled();
  await expect(page.getByRole("button", { name: "הוספת אזור", exact: true })).toBeVisible();
  await expect(jenny.dialog).toBeHidden();
  await expect(jenny.launcher).toBeVisible();
  const id = estimateFromUrl(page);
  expect(await readEstimate(api, id)).toMatchObject({
    name,
    areas: [],
    lines: [],
    status: "draft",
    projectId: null,
  });

  const row = page.getByRole("row").filter({ hasText: item.sku });
  const defaultArea = page.getByRole("heading", { name: "כללי · 1 חזרות", exact: true });
  const editItem = page.getByRole("combobox", { name: "פריט לעריכה", exact: true });
  const itemOption = `${item.description} · שורה 1`;
  const quantity = page.getByLabel("כמות לאזור אחד");
  await test.step("Add a catalogue item to the empty draft", async () => {
    await searchOptions(page, "בחירת פריט מהקטלוג", item.sku);
    await page.getByRole("option", { name: `${item.sku} · ${item.description}` }).click();
    await quantity.fill("2");
    await page.getByRole("button", { name: "הוספת פריט", exact: true }).click();
    await expect(defaultArea).toBeVisible();
    await expect(row.getByRole("cell", { name: "₪50.00", exact: true })).toBeVisible();
    expect(await readEstimate(api, id)).toMatchObject({
      areas: [
        expect.objectContaining({
          name: "כללי",
          repeatCount: 1,
          lines: [expect.objectContaining({ catalogueItemId: item.id })],
        }),
      ],
    });
    await testInfo.attach("manual-catalogue-first-item", {
      body: await page.screenshot(),
      contentType: "image/png",
    });
  });

  await test.step("Change the quantity and reload", async () => {
    await chooseOption(page, editItem, itemOption);
    await quantity.fill("3");
    await page.getByRole("button", { name: "שמירת פריט", exact: true }).click();
    await expect(row.getByRole("cell", { name: "₪75.00", exact: true })).toBeVisible();
    await page.reload();
    await expect(row.getByRole("cell", { name: "3.0000 יח׳", exact: true })).toBeVisible();
    await expect(row.getByRole("cell", { name: "₪75.00", exact: true })).toBeVisible();
  });

  await test.step("Remove the item and verify the saved estimate is empty again", async () => {
    await chooseOption(page, editItem, itemOption);
    await page.getByRole("button", { name: "הסרת פריט", exact: true }).click();
    await expect(page.getByText("אין פריטים באזור הזה.", { exact: true })).toBeVisible();
    await page.reload();
    await expect(defaultArea).toBeVisible();
    await expect(row).toHaveCount(0);
    expect(await readEstimate(api, id)).toMatchObject({
      lines: [],
      areas: [expect.objectContaining({ lines: [] })],
    });
    await expect(jenny.dialog).toBeHidden();
  });

  await page.getByRole("button", { name: "לכל כתבי הכמויות" }).click();
  const openLabel = `פתיחת ${name}`;
  const estimateList = page.getByRole("region", { name: ESTIMATE_LIST, exact: true });
  const openEstimate = estimateList.getByRole("button", { name: openLabel, exact: true });
  await expect(estimateList).toHaveCount(1);
  await expect(
    estimateList.getByRole("button", { name: `פתיחת ${existingName}`, exact: true }),
  ).toBeVisible();
  await expect(openEstimate.getByText(name, { exact: true })).toBeVisible();
  await expect(estimateList.getByText(openLabel, { exact: true })).toHaveCount(0);
  await expect(estimateList.getByRole("button", { name: `פתיחת ${cancelledName}` })).toHaveCount(0);
  await testInfo.attach("manual-estimate-list-card", {
    body: await estimateList.screenshot(),
    contentType: "image/png",
  });
  await openEstimate.focus();
  await expect(openEstimate).toBeFocused();
  await openEstimate.press("Enter");
  await expect(page.getByRole("heading", { name, exact: true })).toBeVisible();
});

test("An engineer links a project and edits a saved estimate and its catalogue quantities without Jenny", async ({
  api,
  apiAs,
  openPageAs,
}) => {
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

  await page.goto(ESTIMATES);
  await page.getByRole("button", { name: NEW_ESTIMATE, exact: true }).click();
  await form.getByRole("textbox", { name: ESTIMATE_NAME }).fill(name);
  await searchOptions(page, "פרויקט (אופציונלי)", project.name);
  await page
    .getByRole("option", { name: `${project.name} · ${project.code}`, exact: true })
    .click();
  await form.getByRole("button", { name: "יצירת כתב כמויות" }).click();
  await expect(page.getByRole("heading", { name, exact: true })).toBeVisible();
  const id = estimateFromUrl(page);
  expect(await readEstimate(engineerApi, id)).toMatchObject({ projectId: project.id });

  await page.getByRole("button", { name: "לכל כתבי הכמויות" }).click();
  await page
    .getByRole("region", { name: ESTIMATE_LIST, exact: true })
    .getByRole("button", { name: `פתיחת ${name}`, exact: true })
    .getByText(name, { exact: true })
    .click();
  await page.getByRole("button", { name: "עריכת פרטי טיוטה" }).click();
  await page.getByRole("textbox", { name: ESTIMATE_NAME }).fill(revisedName);
  await page.getByRole("button", { name: "שמירת שם" }).click();
  await expect(page.getByRole("heading", { name: revisedName, exact: true })).toBeVisible();

  await page.getByLabel("שם אזור או טיפוס").fill(area);
  await page.getByRole("button", { name: "הוספת אזור", exact: true }).click();
  await searchOptions(page, "בחירת פריט מהקטלוג", item.sku);
  await page
    .getByRole("option", { name: `${item.sku} · ${item.description}`, exact: true })
    .click();
  await page.getByLabel("כמות לאזור אחד").fill("2");
  await page.getByRole("button", { name: "הוספת פריט", exact: true }).click();

  const row = page.getByRole("row").filter({ hasText: item.sku });
  await expect(row.getByRole("cell", { name: "₪50.00", exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("heading", { name: revisedName, exact: true })).toBeVisible();
  await expect(row.getByRole("cell", { name: "₪50.00", exact: true })).toBeVisible();
  await expect(jenny.dialog).toBeHidden();
  expect(await readEstimate(engineerApi, id)).toMatchObject({
    name: revisedName,
    projectId: project.id,
    lines: [expect.objectContaining({ quantity: "2.0000", unitPrice: "25.0000", total: "50.00" })],
  });
});

test("Jenny resumes a standalone RTL mobile draft with uploaded plans, repeatable areas and catalogue pricing", async ({
  api,
  page,
}, testInfo) => {
  const item = await createCatalogueFixture({ price: "25.0000" });
  const sourcePlan = "qa-source.pdf";
  const area = "חדר מלון";
  const provenance = "QA FLOOR 2";
  await page.setViewportSize(MOBILE);
  await page.emulateMedia({ reducedMotion: "reduce" });
  const jenny = await startJenny(page, "אומדן עצמאי לבדיקות");
  await expect(jenny.dialog).toHaveAttribute("aria-modal", "true");
  await expect(jenny.dialog).toHaveCSS("direction", "rtl");
  await expect(jenny.dialog).toHaveCSS("width", `${MOBILE.width}px`);
  await expect(jenny.dialog).toHaveCSS("height", `${MOBILE.height}px`);
  const id = estimateFromUrl(page);
  await jenny.dialog.getByRole("button", { name: "המשך ללא פרויקט" }).click();
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

  await searchOptions(page, "בחירת פריט מהקטלוג", item.sku);
  await page.getByRole("option", { name: `${item.sku} · ${item.description}` }).click();
  await page.getByLabel("כמות לאזור אחד").fill("2");
  await page.getByLabel("מקור המדידה (אופציונלי)").fill(provenance);
  await page.getByRole("button", { name: "הוספת פריט" }).click();

  const row = page.getByRole("row").filter({ hasText: item.sku });
  await expect(row.getByRole("cell", { name: provenance })).toBeVisible();
  await expect(row.getByRole("cell", { name: "6.0000 יח׳" })).toBeVisible();
  await expect(row.getByRole("cell", { name: "₪150.00" })).toBeVisible();
  await page.reload();
  await expect(row.getByRole("cell", { name: "₪150.00" })).toBeVisible();
  const viewportWidth = await page.evaluate(() => document.documentElement.scrollWidth);
  expect(viewportWidth).toBe(MOBILE.width);
  expect(await readEstimate(api, id)).toMatchObject({
    projectId: null,
    scope: "hvac_ventilation",
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
  const jenny = await startJenny(page, "אומדן לפרויקט");
  await expect(jenny.dialog).toHaveAttribute("aria-modal", "false");
  await searchOptions(page, "פרויקט (אופציונלי)", project.name);
  await page.getByRole("option", { name: `${project.name} · ${project.code}` }).click();
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
  await page.getByRole("button", { name: "סקיצה ותוצרים" }).click();
  await expect(page.getByText("יש להשלים מחירי קטלוג לפני הפקת הסקיצה.")).toBeVisible();
  await expect(page.getByRole("button", { name: SKETCH })).toBeDisabled();
  await expect(page.getByRole("button", { name: CUSTOMER_PDF })).toHaveCount(0);
  expect(
    (await api.send(HTTP_METHODS.POST, `${path}/approve`, { version: draft.version })).status(),
  ).toBe(HTTP_STATUS.CONFLICT);
  expect((await api.send(HTTP_METHODS.GET, `${path}/proposal`)).status()).toBe(
    HTTP_STATUS.CONFLICT,
  );
});

const markedImage = async (page: Page): Promise<Buffer> =>
  Buffer.from(
    await page.evaluate(() => {
      const canvas = document.createElement("canvas");
      canvas.width = 80;
      canvas.height = 50;
      const context = canvas.getContext("2d");
      if (!context) {
        throw new Error("Canvas could not draw a disposable test plan");
      }
      context.fillStyle = "#1683c9";
      context.fillRect(0, 0, 80, 50);
      context.fillStyle = "#fb3629";
      context.fillRect(30, 15, 20, 20);
      return canvas.toDataURL("image/png").split(",")[1] ?? "";
    }),
    "base64",
  );

const quotationIdentity = async (response: APIResponse): Promise<string> => {
  expect(response.status()).toBe(HTTP_STATUS.CREATED);
  const value: unknown = await response.json();
  if (!isRecord(value) || typeof value.quotationId !== "string") {
    throw new Error("Expected a linked quotation ID");
  }
  return value.quotationId;
};

test("Reviewed revisions yield an exact marked sketch and one approved customer proposal without internal images", async ({
  api,
  page,
  apiAs,
}, testInfo) => {
  const customer = await seedCustomer(api);
  const project = await seedStandaloneProject(api, customer);
  const engineer = await apiAs(TEST_USERS[USER_ROLES.ENGINEER]);
  const priced = await createCatalogueFixture({ price: "250.0000" });
  const excluded = await createCatalogueFixture({ price: "50.0000" });
  const fixture = await estimateResponse(
    await engineer.send(HTTP_METHODS.POST, ESTIMATES, {
      name: "אומדן QA מסחרי",
      projectId: project.id,
    }),
    HTTP_STATUS.CREATED,
  );
  const path = `${ESTIMATES}/${fixture.id}`;
  const area = {
    id: randomUUID(),
    name: "Sample West Wing",
    repeatCount: 2,
    lines: [{ id: randomUUID(), catalogueItemId: priced.id, quantity: "3" }],
  };
  const second = {
    id: randomUUID(),
    name: "Full Quote East Wing",
    repeatCount: 1,
    lines: [{ id: randomUUID(), catalogueItemId: excluded.id, quantity: "1" }],
  };
  const question = {
    id: randomUUID(),
    prompt: "נדרש אישור לסימון",
    options: ["אושר QA", "לחזור לבדיקה"],
    answer: null,
  };
  const prepared = await estimateResponse(
    await engineer.send(HTTP_METHODS.PATCH, path, {
      version: fixture.version,
      setupStep: "complete",
      areas: [area, second],
      questions: [question],
    }),
    HTTP_STATUS.OK,
  );
  expect(prepared.projectId).toBe(project.id);
  await page.goto(estimatePath(fixture.id));
  await page.getByRole("button", { name: "סקיצה ותוצרים" }).click();
  await chooseOption(
    page,
    page.getByRole("combobox", { name: "סוג תוכנית" }),
    "תשריט מסומן לסקיצה",
  );
  const png = await markedImage(page);
  await uploadPlan(page, MARKED_PLAN, "image/png", png);
  await expect(page.getByRole("button", { name: `${MARKED_PLAN} · מסומנת` })).toBeVisible();
  await chooseOption(
    page,
    page.getByRole("combobox", { name: `תשריט לסקיצה: ${area.name}` }),
    MARKED_PLAN,
  );
  await expect(page.getByText("יש לענות על שאלות הבירור לפני הפקת הסקיצה.")).toBeVisible();
  await expect(page.getByRole("button", { name: SKETCH })).toBeDisabled();
  const beforeAnswer = await readEstimate(api, fixture.id);
  expect(beforeAnswer).toMatchObject({
    plans: [expect.objectContaining({ id: expect.any(String), name: MARKED_PLAN, marked: true })],
  });

  await page.getByRole("button", { name: "שאלות לבירור" }).click();
  await page.getByRole("button", { name: question.options[0] }).click();
  await expect(page.getByRole("status").filter({ hasText: question.options[0] })).toBeVisible();
  const current = await readEstimate(api, fixture.id);
  expect(
    (
      await api.send(HTTP_METHODS.PATCH, path, { version: beforeAnswer.version, name: "stale" })
    ).status(),
  ).toBe(HTTP_STATUS.CONFLICT);
  expect(
    (await api.send(HTTP_METHODS.POST, `${path}/quotation`, { version: current.version })).status(),
  ).toBe(HTTP_STATUS.CONFLICT);

  await page.getByRole("button", { name: "סקיצה ותוצרים" }).click();
  await chooseOption(
    page,
    page.getByRole("combobox", { name: `תשריט לסקיצה: ${area.name}` }),
    MARKED_PLAN,
  );
  const sketch = await capturePdf(page, SKETCH);
  const sketchContent = await inspectPdf(sketch);
  await testInfo.attach("generated-sketch", { body: sketch, contentType: "application/pdf" });
  expect(sketchContent.text).toContain(area.name.replace(/\s+/g, ""));
  expect(sketchContent.text).toContain(MARKED_PLAN);
  expect(sketchContent.text).toContain(priced.sku);
  expect(sketchContent.text).not.toContain(second.name.replace(/\s+/g, ""));
  expect(sketchContent.text).not.toContain(excluded.sku);
  expect(
    (
      await api.send(HTTP_METHODS.POST, `${path}/approve`, { version: beforeAnswer.version })
    ).status(),
  ).toBe(HTTP_STATUS.CONFLICT);
  expect((await readEstimate(engineer, fixture.id)).status).toBe("sketch");
  expect(
    (
      await engineer.send(HTTP_METHODS.POST, `${path}/approve`, { version: current.version })
    ).status(),
  ).toBe(HTTP_STATUS.FORBIDDEN);
  await page.getByRole("button", { name: "אישור גרסת הסקיצה" }).click();
  await expect(page.getByText(`גרסה ${current.version} · מאושר`, { exact: true })).toBeVisible();
  expect(await capturePdf(page, "הורדת הסקיצה השמורה")).toEqual(sketch);

  const openQuotation = page.waitForResponse(
    response =>
      response.url().endsWith(`${path}/quotation`) &&
      response.request().method() === HTTP_METHODS.POST,
  );
  await page.getByRole("button", { name: "יצירת טיוטת הצעת מחיר" }).click();
  const quoteResponse = await openQuotation;
  expect(quoteResponse.status()).toBe(HTTP_STATUS.CREATED);
  const quotationId = await quotationIdentity(
    await api.send(HTTP_METHODS.POST, `${path}/quotation`, {
      version: current.version,
    }),
  );
  expect(await quoteResponse.json()).toEqual({ quotationId });
  await expect(page).toHaveURL(new RegExp(`/quotations/${quotationId}$`));
  const quotePath = `/quotation/${quotationId}`;
  const quote = await quotationDocument(await api.send(HTTP_METHODS.GET, quotePath));
  expect(quote).toMatchObject({
    projectId: project.id,
    customerId: customer.id,
    status: QUOTATION.STATUS.DRAFT,
  });
  expect(quote.sections.flatMap(section => section.items)).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        catalogueItemId: priced.id,
        quantity: "6.0000",
        quotedPrice: "250.0000",
      }),
      expect.objectContaining({
        catalogueItemId: excluded.id,
        quantity: "1.0000",
        quotedPrice: "50.0000",
      }),
    ]),
  );
  expect((await api.send(HTTP_METHODS.GET, `${path}/proposal`)).status()).toBe(
    HTTP_STATUS.CONFLICT,
  );

  const adjusted = await saveQuotation(api, quotationId, {
    ...quotationWrite(quote),
    discountPercent: "10.00",
    paymentTerms: PAYMENT_TERMS.PREPAID,
    paymentTermsNote: "QA PAYMENT NOTE",
  });
  expect(adjusted.totals.total).not.toBe(quote.totals.total);
  const review = await quotationDocument(
    await api.send(HTTP_METHODS.POST, `${quotePath}/review`, {
      version: adjusted.version,
      status: QUOTATION.STATUS.REVIEW,
    }),
  );
  const acknowledged = await quotationDocument(
    await api.send(HTTP_METHODS.POST, `${quotePath}/warnings`, {
      version: review.version,
      warningKeys: review.warnings.map(warning => warning.key),
    }),
  );
  const approved = await quotationDocument(
    await api.send(HTTP_METHODS.POST, `${quotePath}/review`, {
      version: acknowledged.version,
      status: QUOTATION.STATUS.APPROVED,
    }),
  );
  await page.goto(estimatePath(fixture.id));
  await page.getByRole("button", { name: "סקיצה ותוצרים" }).click();
  const proposal = await capturePdf(page, CUSTOMER_PDF);
  const proposalContent = await inspectPdf(proposal);
  await testInfo.attach("generated-proposal", { body: proposal, contentType: "application/pdf" });
  expect(proposalContent.text).toContain(approved.totals.total);
  expect(proposalContent.text).toContain("QAPAYMENTNOTE");
  expect(proposalContent.text).toContain(priced.sku);
  expect(proposalContent.text).toContain(excluded.sku);
  expect(proposalContent.text).not.toContain(MARKED_PLAN);
  expect(sketchContent.images).toBeGreaterThan(proposalContent.images);
  const revised = await estimateResponse(
    await engineer.send(HTTP_METHODS.PATCH, path, {
      version: current.version,
      name: "אומדן QA מעודכן",
    }),
    HTTP_STATUS.OK,
  );
  expect(revised).toMatchObject({
    status: "draft",
    quotationId: null,
    version: current.version + 1,
  });
  expect((await api.send(HTTP_METHODS.GET, `${path}/sketch`)).status()).toBe(HTTP_STATUS.NOT_FOUND);
  expect(
    (await api.send(HTTP_METHODS.POST, `${path}/approve`, { version: current.version })).status(),
  ).toBe(HTTP_STATUS.CONFLICT);
  expect(await quotationDocument(await api.send(HTTP_METHODS.GET, quotePath))).toMatchObject({
    id: approved.id,
    status: QUOTATION.STATUS.APPROVED,
    version: approved.version,
    totals: approved.totals,
  });
});
