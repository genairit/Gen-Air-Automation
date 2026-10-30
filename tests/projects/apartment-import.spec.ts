import {
  buildImportRow,
  makeImportWorkbook,
  readImportWorkbook,
} from "../../src/utilities/apartment-import.utility.ts";

import { readFile } from "node:fs/promises";
import { test, expect } from "../../src/fixtures/test.fixture.ts";
import { HTTP_METHODS } from "../../src/constants/http.constant.ts";
import { createProjectPage } from "../../src/pages/project.page.ts";
import { USER_ROLES } from "../../src/constants/user-role.constant.ts";
import { TEST_USERS } from "../../src/constants/test-users.constant.ts";
import { readBuildingApartments } from "../../src/api/apartment-import.api.ts";
import { APARTMENT_IMPORT } from "../../src/constants/apartment-import.constant.ts";
import { seedBuilding, seedCustomer, buildCustomerInput } from "../../src/api/seed-data.ts";

test("selecting XLSX immediately imports and finish refreshes the building", async ({
  page,
  api,
}) => {
  const building = await seedBuilding(api, await seedCustomer(api));
  const project = createProjectPage(page);
  await project.goto(building.id);
  await page.getByRole("button", { name: APARTMENT_IMPORT.OPEN, exact: true }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByText("אין שלב תצוגה מקדימה", { exact: false })).toBeVisible();
  await expect(dialog).toHaveCSS("border-radius", "28px");
  const fileInput = dialog.locator('input[type="file"]');
  await expect(fileInput.locator("..")).toHaveCSS("border-style", "dashed");
  await expect(fileInput.locator("..")).toHaveCSS("border-radius", "24px");
  const chooserEvent = page.waitForEvent("filechooser");
  await fileInput.click();
  const row = buildImportRow(buildCustomerInput(), "17");
  await (
    await chooserEvent
  ).setFiles({
    name: APARTMENT_IMPORT.FILE_NAME,
    mimeType: APARTMENT_IMPORT.MIME_TYPE,
    buffer: await makeImportWorkbook([row, row]),
  });
  await expect(dialog.getByText("1 מתוך 2 שורות נקלטו", { exact: true })).toBeVisible();
  await expect(dialog.getByRole("status")).toHaveCSS("background-color", "rgb(255, 246, 224)");
  await expect(dialog.getByRole("status")).toHaveCSS("direction", "rtl");
  await expect(dialog.getByRole("status").locator("b")).toHaveCSS("text-align", /^(start|right)$/);
  await expect(
    dialog.getByText("דירות קיימות לא עודכנו ולא נמחקו.", { exact: false }),
  ).toBeVisible();
  const download = page.waitForEvent("download");
  await dialog.getByRole("button", { name: "הורד דוח שגיאות (.xlsx)", exact: true }).click();
  expect((await download).suggestedFilename()).toBe("apartments-errors.xlsx");
  await dialog.getByRole("button", { name: APARTMENT_IMPORT.FINISH, exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(project.findApartmentRow("דירה 17")).toBeVisible();
});

test("invalid template displays actionable error and retry without a preview step", async ({
  page,
  api,
}, testInfo) => {
  const building = await seedBuilding(api, await seedCustomer(api));
  await createProjectPage(page).goto(building.id);
  await page.getByRole("button", { name: APARTMENT_IMPORT.OPEN, exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog.locator('input[type="file"]').setInputFiles({
    name: APARTMENT_IMPORT.FILE_NAME,
    mimeType: APARTMENT_IMPORT.MIME_TYPE,
    buffer: await makeImportWorkbook([], [...APARTMENT_IMPORT.HEADERS].reverse()),
  });
  await expect(dialog.getByText("INVALID_TEMPLATE", { exact: false })).toBeVisible();
  await expect(
    dialog.getByText("מבנה הקובץ אינו תואם. יש להשתמש בתבנית הרשמית ללא שינוי שמות העמודות.", {
      exact: true,
    }),
  ).toBeVisible();
  await expect(dialog.getByText("Invalid apartment import template", { exact: false })).toHaveCount(
    0,
  );
  await expect(dialog.getByRole("button", { name: "העלה קובץ אחר", exact: true })).toBeVisible();
  await dialog.screenshot({ path: testInfo.outputPath("import-template-error.png") });
  await dialog.getByRole("button", { name: "העלה קובץ אחר", exact: true }).click();
  await expect(
    dialog.getByText("גרור לכאן את קובץ האקסל או לחץ לבחירה", { exact: true }),
  ).toBeVisible();
});

test("official template, requiredness help, visible processing and100 real rows refresh without updates", async ({
  page,
  api,
}, testInfo) => {
  const building = await seedBuilding(api, await seedCustomer(api));
  const project = createProjectPage(page);
  await project.goto(building.id);
  await page.getByRole("button", { name: APARTMENT_IMPORT.OPEN, exact: true }).click();
  const dialog = page.getByRole("dialog");
  await expect(
    dialog.getByText("מספר מזהה לקוח (ח״פ / ת״ז) נדרש בכל שורה.", { exact: false }),
  ).toBeVisible();
  await expect(
    dialog.getByText("ללקוח חדש נדרשים גם סוג לקוח וכתובת לקוח, לצד שם, טלפון ודוא״ל תקינים.", {
      exact: false,
    }),
  ).toBeVisible();
  const templateEvent = page.waitForEvent("download");
  await dialog.getByRole("button", { name: "הורד תבנית אקסל", exact: true }).click();
  const templateDownload = await templateEvent;
  expect(templateDownload.suggestedFilename()).toBe("apartments-template.xlsx");
  const template = await readImportWorkbook(await readFile(await templateDownload.path()));
  const sheet = template.getWorksheet(APARTMENT_IMPORT.SHEET);
  expect(sheet?.columnCount).toBe(APARTMENT_IMPORT.HEADERS.length);
  expect(
    APARTMENT_IMPORT.HEADERS.map((_, index) => sheet?.getRow(1).getCell(index + 1).text),
  ).toEqual(APARTMENT_IMPORT.HEADERS);
  await dialog.screenshot({ path: testInfo.outputPath("import-upload.png") });

  const customer = buildCustomerInput();
  const rows = Array.from({ length: 100 }, (_, index) =>
    buildImportRow(customer, String(index + 1)),
  );
  const release = { response: () => {} };
  const processing = new Promise<void>(resolve => {
    release.response = resolve;
  });
  await page.route(`**/project/${building.id}/apartments/import`, async route => {
    const response = await route.fetch();
    await processing;
    await route.fulfill({ response });
  });
  try {
    await dialog.locator('input[type="file"]').setInputFiles({
      name: APARTMENT_IMPORT.FILE_NAME,
      mimeType: APARTMENT_IMPORT.MIME_TYPE,
      buffer: await makeImportWorkbook(rows),
    });
    await expect(dialog.getByText("מעלה ומעבד את הקובץ…", { exact: true })).toBeVisible();
    await expect(dialog.getByRole("progressbar")).toBeVisible();
    await expect(dialog.getByRole("button", { name: "סגור", exact: true })).toBeDisabled();
    await dialog.screenshot({ path: testInfo.outputPath("import-processing.png") });
  } finally {
    release.response();
  }
  await expect(
    dialog.getByText("הייבוא הושלם בהצלחה — 100 מתוך 100 שורות נקלטו", { exact: true }),
  ).toBeVisible();
  await expect(dialog.getByRole("status")).toHaveCSS("background-color", "rgb(225, 237, 250)");
  await dialog.screenshot({ path: testInfo.outputPath("import-success.png") });
  const apartments = await readBuildingApartments(api, building.id);
  expect(apartments).toHaveLength(100);

  await dialog.getByRole("button", { name: APARTMENT_IMPORT.FINISH, exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(
    page.getByRole("row").filter({ has: page.getByText("דירה 1", { exact: true }) }),
  ).toBeVisible();
  await page.unroute(`**/project/${building.id}/apartments/import`);
  await page.getByRole("button", { name: APARTMENT_IMPORT.OPEN, exact: true }).click();
  await expect(dialog.getByText("לבניין כבר יש 100 דירות", { exact: false })).toBeVisible();
  const changed = buildImportRow(customer, "1");
  changed[9] = "999.99";
  await dialog.locator('input[type="file"]').setInputFiles({
    name: APARTMENT_IMPORT.FILE_NAME,
    mimeType: APARTMENT_IMPORT.MIME_TYPE,
    buffer: await makeImportWorkbook([changed]),
  });
  await expect(dialog.getByText("0 מתוך 1 שורות נקלטו", { exact: false })).toBeVisible();
  expect(await readBuildingApartments(api, building.id)).toEqual(apartments);
});

test("client rejects unsupported file and real partial results show conflict labels and exact skipped workbook", async ({
  page,
  api,
}, testInfo) => {
  const building = await seedBuilding(api, await seedCustomer(api));
  const existingInput = buildCustomerInput();
  const existing = await api.createCustomer(existingInput);
  await createProjectPage(page).goto(building.id);
  await page.getByRole("button", { name: APARTMENT_IMPORT.OPEN, exact: true }).click();
  const dialog = page.getByRole("dialog");
  const uploads: string[] = [];
  page.on("request", request => {
    if (
      request.method() === HTTP_METHODS.POST &&
      request.url().endsWith(`/project/${building.id}/apartments/import`)
    ) {
      uploads.push(request.url());
    }
  });
  await dialog
    .locator('input[type="file"]')
    .setInputFiles({ name: "invalid.txt", mimeType: "text/plain", buffer: Buffer.from("invalid") });
  await expect(dialog.getByText("סוג קובץ לא נתמך", { exact: false })).toBeVisible();
  expect(uploads).toEqual([]);
  await expect(dialog.getByRole("button", { name: "נסה קובץ אחר", exact: true })).toBeVisible();
  await dialog.getByRole("button", { name: "נסה קובץ אחר", exact: true }).click();

  const valid = buildImportRow(buildCustomerInput(), "21");
  const conflict = buildImportRow(existingInput, "22");
  conflict[3] = "שם שונה";
  conflict[4] = "0529999999";
  const invalid = buildImportRow(buildCustomerInput(), "23");
  invalid[5] = "not-an-email";
  await dialog.locator('input[type="file"]').setInputFiles({
    name: APARTMENT_IMPORT.FILE_NAME,
    mimeType: APARTMENT_IMPORT.MIME_TYPE,
    buffer: await makeImportWorkbook([valid, valid, conflict, invalid]),
  });
  await expect(dialog.getByText("1 מתוך 4 שורות נקלטו", { exact: false })).toBeVisible();
  const skipped = dialog.getByLabel("שורות שלא נקלטו");
  await expect(skipped.getByText("שורה 4", { exact: false })).toBeVisible();
  await expect(skipped.getByText(/שם לקוח.*טלפון לקוח/)).toBeVisible();
  await expect(skipped.getByText(existingInput.phone, { exact: false })).toHaveCount(0);
  await expect(skipped.getByText("0529999999", { exact: false })).toHaveCount(0);
  await dialog.screenshot({ path: testInfo.outputPath("import-partial.png") });
  const reportEvent = page.waitForEvent("download");
  await dialog.getByRole("button", { name: "הורד דוח שגיאות (.xlsx)", exact: true }).click();
  const reportDownload = await reportEvent;
  const report = await readImportWorkbook(await readFile(await reportDownload.path()));
  const reportSheet = report.getWorksheet(APARTMENT_IMPORT.SHEET);
  expect(reportSheet?.columnCount).toBe(APARTMENT_IMPORT.HEADERS.length + 1);
  expect(reportSheet?.rowCount).toBe(4);
  const reportHeaders = [...APARTMENT_IMPORT.HEADERS, APARTMENT_IMPORT.ERROR_HEADER];
  expect(reportHeaders.map((_, index) => reportSheet?.getRow(1).getCell(index + 1).text)).toEqual(
    reportHeaders,
  );
  for (const [rowIndex, row] of [valid, conflict, invalid].entries()) {
    expect(
      row.map((_, index) => reportSheet?.getRow(rowIndex + 2).getCell(index + 1).text),
    ).toEqual(row);
    expect(reportSheet?.getRow(rowIndex + 2).getCell(reportHeaders.length).text).toMatch(/\S/);
  }
  expect(await api.getCustomer(existing.id)).toEqual(existing);
  expect(await readBuildingApartments(api, building.id)).toHaveLength(1);
  await dialog.getByRole("button", { name: "העלה קובץ מתוקן", exact: true }).click();
  await expect(
    dialog.getByText("גרור לכאן את קובץ האקסל או לחץ לבחירה", { exact: true }),
  ).toBeVisible();
});

test("engineering user sees customer contacts read-only and cannot open apartment import", async ({
  api,
  openPageAs,
}) => {
  const customer = await seedCustomer(api);
  const building = await seedBuilding(api, customer);
  const page = await openPageAs(TEST_USERS[USER_ROLES.ENGINEER]);
  await page.goto(`/customers/${customer.id}`);
  await expect(page.getByText("אנשי הקשר של הלקוח", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "הוספת איש קשר", exact: true })).toHaveCount(0);
  await createProjectPage(page).goto(building.id);
  await expect(page.getByRole("button", { name: APARTMENT_IMPORT.OPEN, exact: true })).toHaveCount(
    0,
  );
});
