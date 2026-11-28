import {
  seedBuilding,
  seedCustomer,
  seedApartment,
  buildProjectInput,
} from "../../src/api/seed-data.ts";

import {
  saveQuotation,
  quotationWrite,
  createQuotation,
  quotationDocument,
} from "../../src/api/quotation.api.ts";

import {
  buildProjectRoute,
  buildApartmentRoute,
  readLastPathSegment,
} from "../../src/utilities/route.utility.ts";

import type { Page } from "@playwright/test";
import { test, expect } from "../../src/fixtures/test.fixture.ts";
import { HTTP_METHODS } from "../../src/constants/http.constant.ts";
import { QUOTATION } from "../../src/constants/quotation.constant.ts";
import { USER_ROLES } from "../../src/constants/user-role.constant.ts";
import { TEST_USERS } from "../../src/constants/test-users.constant.ts";
import { PERMISSIONS } from "../../src/constants/permission.constant.ts";
import { PROJECT_TYPE_NAMES } from "../../src/constants/domain.constant.ts";
import { withRolePermissions } from "../../src/environment/role-permissions.ts";
import { seedQuotationForDeletion } from "../../src/api/quotation-delete-fixture.ts";
import { createTestDatabaseClient } from "../../src/environment/test-database-client.ts";
import { expectSameQuotationRow } from "../../src/utilities/quotation-layout.utility.ts";
import { workspaceTab, openWorkspaceTab } from "../../src/pages/project-workspace.component.ts";

const quotationsPanel = (page: Page) => page.getByRole("tabpanel", { name: "הצעות מחיר" });
const createButton = (page: Page) =>
  page.getByRole("button", { name: "הצעת מחיר חדשה", exact: true });
const emptyMessage = "אין עדיין הצעות מחיר בפרויקט זה.";

for (const kind of [...Object.values(PROJECT_TYPE_NAMES), "apartment"] as const) {
  test(`empty ${kind} tab creates a new quotation for its own project and customer`, async ({
    api,
    page,
  }) => {
    const customer = await seedCustomer(api);
    const project =
      kind === "apartment"
        ? await api.createApartment((await seedBuilding(api, await seedCustomer(api))).id, {
            customerId: customer.id,
            customerFloor: 3,
            customerApartment: "7",
          })
        : await api.createProject({
            ...buildProjectInput({ customer, projectTypeId: (await api.findProjectType(kind)).id }),
            ...(kind === PROJECT_TYPE_NAMES.INSTITUTION
              ? { customerFloor: 3, customerUnit: "משרד" }
              : {}),
            ...([PROJECT_TYPE_NAMES.LUXURY_APARTMENT, PROJECT_TYPE_NAMES.PRIVATE_CLIENT].some(
              type => type === kind,
            )
              ? { customerFloor: 3, customerApartment: "7" }
              : {}),
          });
    await page.goto(buildProjectRoute(project.id));
    await openWorkspaceTab(page, "quotations");
    const panel = quotationsPanel(page);
    const returnUrl = page.url();
    await expect(panel).toHaveText(emptyMessage);
    await expect(panel.getByRole("heading")).toHaveCount(0);
    const action = createButton(page);
    await expect(action).toBeVisible();
    await expectSameQuotationRow([workspaceTab(page, "quotations"), action]);
    await action.click();
    await expect(page).toHaveURL(new RegExp(`/projects/${project.id}/quotations/new$`));
    await expect(
      page.getByText(`${project.name} · ${customer.name}`, { exact: true }),
    ).toBeVisible();
    await page.getByRole("button", { name: "יצירת הצעה", exact: true }).click();
    await expect(page).toHaveURL(/\/quotations\/[\da-f-]{36}$/);
    const saved = await quotationDocument(
      await api.send(HTTP_METHODS.GET, `/quotation/${readLastPathSegment(page.url())}`),
    );
    expect(saved).toMatchObject({
      customerId: customer.id,
      projectId: project.id,
      status: QUOTATION.STATUS.DRAFT,
    });
    await page.getByRole("link", { name: /חזרה להצעות מחיר/ }).click();
    await expect(page).toHaveURL(returnUrl);
    await expect(
      panel.getByRole("button", { name: `${saved.number} · ${customer.name} · טיוטה` }),
    ).toBeVisible();
  });
}

test("each linked record has one card with its recipient, current total and last update across brands", async ({
  api,
  page,
}) => {
  const {
    quotation: order,
    project,
    customer,
  } = await seedQuotationForDeletion(api, QUOTATION.STATUS.APPROVED);
  const draft = await createQuotation(api, customer.id, project.id);
  const multiBrand = await saveQuotation(api, draft.id, {
    ...quotationWrite(draft),
    brand: QUOTATION.BRAND,
    brands: [QUOTATION.BRAND, QUOTATION.OTHER_BRAND],
  });
  const other = await createQuotation(api, customer.id);
  await page.goto(buildProjectRoute(project.id));
  await openWorkspaceTab(page, "quotations");
  const panel = quotationsPanel(page);
  await expect(panel.getByRole("button")).toHaveCount(2);
  await expect(panel.getByText(other.number)).toHaveCount(0);
  await expect(panel.getByRole("heading")).toHaveCount(0);
  const summary = await api.send(HTTP_METHODS.GET, `/quotation/project/${project.id}`);
  expect(summary.status()).toBe(200);
  const rows: { items: { id: string; updatedAt: string }[] } = await summary.json();
  for (const [document, status] of [
    [order, "הזמנה"],
    [multiBrand, "טיוטה"],
  ] as const) {
    const button = panel.getByRole("button", {
      name: `${document.number} · ${customer.name} · ${status}`,
    });
    await expect(button).toBeVisible();
    const card = panel.getByRole("region", { name: new RegExp(document.number) });
    await expect(card.getByText(document.number, { exact: true })).toBeVisible();
    await expect(card.getByText(customer.name, { exact: true })).toBeVisible();
    await expect(card.getByText(status, { exact: true })).toBeVisible();
    const total = Number(document.totals.total).toLocaleString("he-IL", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
    await expect(card.getByText(`₪${total}`, { exact: true })).toBeVisible();
    const updated = rows.items.find(row => row.id === document.id);
    if (!updated) throw new Error(`Project feed did not include ${document.number}`);
    await expect(card.locator("time")).toHaveAttribute("datetime", updated.updatedAt);
    await expect(card.locator("time")).toContainText("עודכן");
  }
});

test("a customerless apartment cannot create a quotation; readers can see the tab without its create action", async ({
  api,
  page,
  openPageAs,
}) => {
  const building = await seedBuilding(api, await seedCustomer(api));
  const apartment = await seedApartment(api, building);
  const database = createTestDatabaseClient();
  await database.connect();
  try {
    await database.query("UPDATE projects SET customer_id=NULL WHERE id=$1", [apartment.id]);
  } finally {
    await database.end();
  }
  const route = buildApartmentRoute(building.id, apartment.id);
  await page.goto(route);
  await openWorkspaceTab(page, "quotations");
  await createButton(page).click();
  await expect(page.getByText("יש לקשר לקוח לפרויקט כדי ליצור הצעת מחיר.")).toBeVisible();
  await expect(page.getByRole("button", { name: "יצירת הצעה", exact: true })).toHaveCount(0);
  await withRolePermissions(
    USER_ROLES.ENGINEER,
    [PERMISSIONS.PROJECTS_READ, PERMISSIONS.QUOTATIONS_READ],
    async () => {
      const reader = await openPageAs(TEST_USERS[USER_ROLES.ENGINEER]);
      await reader.goto(route);
      await openWorkspaceTab(reader, "quotations");
      await expect(quotationsPanel(reader)).toHaveText(emptyMessage);
      await expect(createButton(reader)).toHaveCount(0);
    },
  );
});
