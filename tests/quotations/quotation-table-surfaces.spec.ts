import { randomUUID } from "node:crypto";
import type { Locator, Page } from "@playwright/test";
import { test, expect } from "../../src/fixtures/test.fixture.ts";
import { HTTP_METHODS } from "../../src/constants/http.constant.ts";
import { QUOTATION } from "../../src/constants/quotation.constant.ts";
import { PAYMENT_TERMS } from "../../src/constants/domain.constant.ts";
import { USER_ROLES } from "../../src/constants/user-role.constant.ts";
import { createEmployeesPage } from "../../src/pages/employees.page.ts";
import { createCatalogueFixture } from "../../src/environment/quotation-fixtures.ts";
import { createTestDatabaseClient } from "../../src/environment/test-database-client.ts";
import { seedCustomer, seedStandaloneProject, seedUser } from "../../src/api/seed-data.ts";
import { createQuotation, quotationWrite, saveQuotation } from "../../src/api/quotation.api.ts";

const VIEWPORTS = [
  { name: "desktop", width: 1440, height: 900 },
  { name: "mobile", width: 390, height: 844 },
] as const;

const surface = (row: Locator) =>
  row.evaluate(element => {
    const style = getComputedStyle(element);
    return {
      radius: style.borderRadius,
      borderColor: style.borderTopColor,
      borderWidth: style.borderTopWidth,
      background: style.backgroundColor,
      shadow: style.boxShadow,
    };
  });

const expectContained = async (page: Page, row: Locator) => {
  const bounds = await row.boundingBox();
  if (!bounds) {
    throw new Error("Expected visible quotation row");
  }
  expect(bounds.x).toBeGreaterThanOrEqual(0);
  expect(bounds.x + bounds.width).toBeLessThanOrEqual(page.viewportSize()!.width + 1);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
    page.viewportSize()!.width,
  );
};

for (const viewport of VIEWPORTS) {
  test(`${viewport.name} quotation, pending-plan and review rows match the workers table surface`, async ({
    api,
    page,
  }, testInfo) => {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    const employee = await seedUser(api, USER_ROLES.ENGINEER);
    const employees = createEmployeesPage(page);
    await employees.goto();
    await employees.searchBox.fill(employee.email);
    const employeeRow = employees.findRow(employee.email);
    await expect(employeeRow).toBeVisible();
    const reference = await surface(employeeRow);
    expect(parseFloat(reference.radius)).toBeGreaterThan(0);
    expect(reference.shadow).toBe("none");

    const customer = await seedCustomer(api);
    const project = await seedStandaloneProject(api, customer);
    const item = await createCatalogueFixture();
    const initial = await createQuotation(api, customer.id);
    const quotation = await saveQuotation(api, initial.id, {
      ...quotationWrite(initial),
      projectId: project.id,
      brand: QUOTATION.BRAND,
      paymentTerms: PAYMENT_TERMS.PREPAID,
      sections: [
        {
          id: randomUUID(),
          title: "Rounded row",
          systemType: QUOTATION.SYSTEM.SINGLE,
          brand: QUOTATION.BRAND,
          items: [
            {
              id: randomUUID(),
              catalogueItemId: item.id,
              parentItemId: null,
              description: item.description,
              quotedPrice: item.price,
              quantity: "1",
              location: "Room",
              circuit: null,
              requestedCapacityBtu: item.capacityBtu,
            },
          ],
        },
      ],
    });
    const database = createTestDatabaseClient();
    await database.connect();
    try {
      await database.query("UPDATE projects SET drive_folder_id = $2 WHERE id = $1", [
        project.id,
        `qa-project-${project.id}`,
      ]);
    } finally {
      await database.end();
    }

    await page.goto("/quotations");
    const quotationRow = page.getByRole("button", { name: new RegExp(quotation.number) });
    await expect(quotationRow).toBeVisible();
    expect(await surface(quotationRow)).toEqual(reference);
    await expectContained(page, quotationRow);
    await quotationRow.hover();
    await expect(quotationRow).toHaveCSS("box-shadow", "none");
    await page.screenshot({
      path: testInfo.outputPath(`${viewport.name}-quotation-list.png`),
      fullPage: true,
    });

    await quotationRow.focus();
    await expect(quotationRow).toBeFocused();
    await quotationRow.press("Enter");
    await expect(page).toHaveURL(new RegExp(`/quotations/${quotation.id}$`));
    const reviewResponse = await api.send(HTTP_METHODS.POST, `/quotation/${quotation.id}/review`, {
      version: quotation.version,
      status: QUOTATION.STATUS.REVIEW,
    });
    expect(reviewResponse.status()).toBe(201);
    await page.reload();
    const lineRow = page.getByRole("row").filter({ hasText: item.sku });
    await expect(lineRow).toBeVisible();
    const reviewStyle = await lineRow.evaluate(element => {
      const cells = [...element.querySelectorAll("td")];
      const first = getComputedStyle(cells[0]!);
      const last = getComputedStyle(cells[cells.length - 1]!);
      return {
        firstRadius: first.borderStartStartRadius,
        lastRadius: last.borderStartEndRadius,
        background: first.backgroundColor,
        borderWidth: first.borderTopWidth,
        collapse: getComputedStyle(element.closest("table")!).borderCollapse,
      };
    });
    expect(parseFloat(reviewStyle.firstRadius)).toBeGreaterThan(0);
    expect(parseFloat(reviewStyle.lastRadius)).toBeGreaterThan(0);
    expect(reviewStyle.background).not.toBe("rgba(0, 0, 0, 0)");
    expect(reviewStyle.borderWidth).toBe("1px");
    expect(reviewStyle.collapse).toBe("separate");
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
      viewport.width,
    );
    await page.screenshot({
      path: testInfo.outputPath(`${viewport.name}-quotation-review.png`),
      fullPage: true,
    });

    const planResponse = await api.send(HTTP_METHODS.POST, "/execution-plan", {
      quotationId: quotation.id,
      projectId: project.id,
      driveFileId: `qa-plan-${project.id}`,
      planVersion: "01",
    });
    expect(planResponse.status()).toBe(201);
    const plan = (await planResponse.json()) as {
      id: string;
      revision: number;
      checklist: { key: string }[];
    };
    const checkedResponse = await api.send(
      HTTP_METHODS.PATCH,
      `/execution-plan/${plan.id}/checklist`,
      {
        revision: plan.revision,
        confirmedKeys: plan.checklist.map(item => item.key),
      },
    );
    expect(checkedResponse.status()).toBe(200);
    const checked = (await checkedResponse.json()) as { revision: number };
    expect(
      (
        await api.send(HTTP_METHODS.POST, `/execution-plan/${plan.id}/submit`, {
          revision: checked.revision,
        })
      ).status(),
    ).toBe(201);

    await page.goto("/quotations");
    await page.getByRole("button", { name: /ממתינות לאישור/ }).click();
    const pendingRow = page.getByRole("button", { name: new RegExp(quotation.number) });
    await expect(pendingRow).toBeVisible();
    expect(await surface(pendingRow)).toEqual(reference);
    await expectContained(page, pendingRow);
    await pendingRow.hover();
    await expect(pendingRow).toHaveCSS("box-shadow", "none");
    await page.screenshot({
      path: testInfo.outputPath(`${viewport.name}-pending-plans.png`),
      fullPage: true,
    });
    await pendingRow.focus();
    await expect(pendingRow).toBeFocused();
    await pendingRow.press("Enter");
    await expect(page).toHaveURL(new RegExp(`/quotations/${quotation.id}$`));
  });
}
