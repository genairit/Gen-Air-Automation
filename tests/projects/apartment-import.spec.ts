import {
  buildImportRow,
  makeImportWorkbook,
} from "../../src/utilities/apartment-import.utility.ts";

import { test, expect } from "../../src/fixtures/test.fixture.ts";
import { createProjectPage } from "../../src/pages/project.page.ts";
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
  const row = buildImportRow(buildCustomerInput(), "17");
  await dialog.locator('input[type="file"]').setInputFiles({
    name: APARTMENT_IMPORT.FILE_NAME,
    mimeType: APARTMENT_IMPORT.MIME_TYPE,
    buffer: await makeImportWorkbook([row, row]),
  });
  await expect(dialog.getByText("1 מתוך 2 שורות נקלטו", { exact: true })).toBeVisible();
  await expect(
    dialog.getByText("דירות קיימות לא עודכנו ולא נמחקו.", { exact: false }),
  ).toBeVisible();
  const download = page.waitForEvent("download");
  await dialog.getByRole("button", { name: "הורד דוח שגיאות (.xlsx)", exact: true }).click();
  expect((await download).suggestedFilename()).toBe("apartments-errors.xlsx");
  await dialog.getByRole("button", { name: "סיום ורענון הדירות", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(project.findApartmentRow("דירה 17")).toBeVisible();
});

test("invalid template displays actionable error and retry without a preview step", async ({
  page,
  api,
}) => {
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
  await expect(dialog.getByRole("button", { name: "נסה קובץ אחר", exact: true })).toBeVisible();
});
