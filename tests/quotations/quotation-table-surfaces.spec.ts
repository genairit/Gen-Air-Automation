import { randomUUID } from "node:crypto";
import type { Locator, Page } from "@playwright/test";
import { test, expect } from "../../src/fixtures/test.fixture.ts";
import { HTTP_METHODS } from "../../src/constants/http.constant.ts";
import { QUOTATION } from "../../src/constants/quotation.constant.ts";
import { PAYMENT_TERMS } from "../../src/constants/domain.constant.ts";
import { USER_ROLES } from "../../src/constants/user-role.constant.ts";
import { createEmployeesPage } from "../../src/pages/employees.page.ts";
import { openWorkspaceTab } from "../../src/pages/project-workspace.component.ts";
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
  test(`${viewport.name} project quotation cards have a flat surface and open their review and pending plan`, async ({
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
    const initial = await createQuotation(api, customer.id, project.id);
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

    await page.goto(`/projects/${project.id}`);
    await openWorkspaceTab(page, "quotations");
    const quotationCard = page.getByRole("region", { name: new RegExp(quotation.number) });
    const openQuotation = quotationCard.getByRole("button", { name: new RegExp(quotation.number) });
    await expect(quotationCard).toBeVisible();
    const style = await surface(quotationCard);
    expect(parseFloat(style.radius)).toBeGreaterThan(0);
    expect(style.borderWidth).toBe(reference.borderWidth);
    expect(style.shadow).toBe(reference.shadow);
    await expectContained(page, quotationCard);
    await quotationCard.hover();
    await expect(quotationCard).toHaveCSS("box-shadow", "none");
    await page.screenshot({
      path: testInfo.outputPath(`${viewport.name}-project-quotation-card.png`),
      fullPage: true,
    });

    await openQuotation.focus();
    await expect(openQuotation).toBeFocused();
    await openQuotation.press("Enter");
    await expect(page).toHaveURL(new RegExp(`/quotations/${quotation.id}#apartment-sharing$`));
    const reviewResponse = await api.send(HTTP_METHODS.POST, `/quotation/${quotation.id}/review`, {
      version: quotation.version,
      status: QUOTATION.STATUS.REVIEW,
    });
    expect(reviewResponse.status()).toBe(201);
    await page.reload();
    const table = page.getByRole("table", { name: "פריטי ההצעה", exact: true });
    const lineRow = table.getByRole("row").filter({ hasText: item.sku });
    await expect(lineRow.getByRole("rowheader")).toContainText(item.description);
    await expect(lineRow.getByRole("cell")).toHaveCount(3);
    await expect(lineRow.getByRole("spinbutton")).toHaveCount(0);
    await expect(table).toHaveCSS("border-collapse", "collapse");
    await expect(table).toHaveCSS("table-layout", "fixed");
    for (const cell of await lineRow.locator("th, td").all()) {
      await expect(cell).toHaveCSS("border-block-end-width", "1px");
      await expect(cell).toHaveCSS("border-block-end-style", "solid");
    }
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

    await page.reload();
    const pendingPlan = page.getByRole("region", { name: "אישור תוכנית לביצוע", exact: true });
    await expect(pendingPlan.getByText("ממתינה לאישור", { exact: true })).toBeVisible();
    await expectContained(page, pendingPlan);
    await page.screenshot({
      path: testInfo.outputPath(`${viewport.name}-quotation-pending-plan.png`),
      fullPage: true,
    });
  });
}
