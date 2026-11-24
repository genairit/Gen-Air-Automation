import {
  seedUser,
  seedCustomer,
  linkToProject,
  buildTaskInput,
  buildStandaloneProjectInput,
} from "../../src/api/seed-data.ts";

import {
  saveQuotation,
  quotationWrite,
  createQuotation,
  quotationDocument,
} from "../../src/api/quotation.api.ts";

import { randomUUID } from "node:crypto";
import { ROUTES } from "../../src/constants/routes.constant.ts";
import { readTabCount } from "../../src/pages/tab.component.ts";
import { test, expect } from "../../src/fixtures/test.fixture.ts";
import { createTaskFormPage } from "../../src/pages/tasks.page.ts";
import { HTTP_METHODS } from "../../src/constants/http.constant.ts";
import { QUOTATION } from "../../src/constants/quotation.constant.ts";
import { PAYMENT_TERMS } from "../../src/constants/domain.constant.ts";
import { USER_ROLES } from "../../src/constants/user-role.constant.ts";
import { NAVIGATION_COPY } from "../../src/constants/copy.constant.ts";
import { TEST_USERS } from "../../src/constants/test-users.constant.ts";
import { createEmployeesPage } from "../../src/pages/employees.page.ts";
import { createQuotationPage } from "../../src/pages/quotation.page.ts";
import { PERMISSIONS } from "../../src/constants/permission.constant.ts";
import { createCatalogueFixture } from "../../src/environment/quotation-fixtures.ts";

const LEAD = USER_ROLES.ENGINEERING_LEAD;

test("lead can be assigned as an engineer and appears in the engineering count and selectors", async ({
  api,
  page,
}) => {
  const before = await api.readRoleCounts();
  const lead = await seedUser(api, LEAD);
  const after = await api.readRoleCounts();
  expect(after[LEAD]).toBe(before[LEAD] + 1);
  expect(after[USER_ROLES.ENGINEER]).toBe(before[USER_ROLES.ENGINEER] + 1);

  const employees = createEmployeesPage(page);
  await employees.goto();
  await employees.roleTab(USER_ROLES.ENGINEER).click();
  await expect
    .poll(() => readTabCount(employees.roleTab(USER_ROLES.ENGINEER)))
    .toBe(after[USER_ROLES.ENGINEER]);
  await employees.searchBox.fill(lead.email);
  await expect(employees.findRow(lead.email)).toBeVisible();

  const customer = await seedCustomer(api);
  const input = await buildStandaloneProjectInput(api, customer, [
    { role: USER_ROLES.ENGINEER, userId: lead.id },
  ]);
  const project = await api.createProject(input);
  expect(await api.getProjectMembers(project.id)).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ role: USER_ROLES.ENGINEER, userId: lead.id }),
    ]),
  );
  const task = await api.createTask(
    buildTaskInput({ link: linkToProject(project), assigneeId: lead.id }),
  );
  expect((await api.getTask(task.id)).assigneeId).toBe(lead.id);

  const taskForm = createTaskFormPage(page);
  await taskForm.goto();
  await expect(
    (await taskForm.openAssigneeOptions()).filter({ hasText: lead.firstName }),
  ).toBeVisible();
});

test("lead keeps engineer grants and can approve a reviewed quotation while engineer cannot", async ({
  api,
  apiAs,
  openPageAs,
}) => {
  const lead = await apiAs(TEST_USERS[LEAD]);
  const engineer = await apiAs(TEST_USERS[USER_ROLES.ENGINEER]);
  for (const grant of engineer.session.user.permissions) {
    expect(lead.session.user.permissions).toContain(grant);
  }
  expect(lead.session.user.permissions).toContain(PERMISSIONS.QUOTATIONS_APPROVE);
  expect(lead.session.user.permissions).toContain(PERMISSIONS.EXECUTION_PLANS_APPROVE);
  expect(lead.session.user.permissions).not.toContain(PERMISSIONS.EMPLOYEES_CREATE);

  const customer = await seedCustomer(api);
  const item = await createCatalogueFixture();
  const initial = await createQuotation(api, customer.id);
  const saved = await saveQuotation(api, initial.id, {
    ...quotationWrite(initial),
    brand: QUOTATION.BRAND,
    paymentTerms: PAYMENT_TERMS.PREPAID,
    sections: [
      {
        id: randomUUID(),
        title: "Lead review",
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
            location: "",
            circuit: null,
            requestedCapacityBtu: item.capacityBtu,
          },
        ],
      },
    ],
  });
  const initialReview = await quotationDocument(
    await api.send(HTTP_METHODS.POST, `/quotation/${saved.id}/review`, {
      version: saved.version,
      status: QUOTATION.STATUS.REVIEW,
    }),
  );
  const review =
    initialReview.warnings.length > 0
      ? await quotationDocument(
          await api.send(HTTP_METHODS.POST, `/quotation/${saved.id}/warnings`, {
            version: initialReview.version,
            warningKeys: initialReview.warnings.map(warning => warning.key),
          }),
        )
      : initialReview;
  expect(
    (
      await engineer.send(HTTP_METHODS.POST, `/quotation/${saved.id}/review`, {
        version: review.version,
        status: QUOTATION.STATUS.APPROVED,
      })
    ).status(),
  ).toBe(403);

  const leadPage = await openPageAs(TEST_USERS[LEAD]);
  const quote = createQuotationPage(leadPage);
  await quote.goto(saved.id);
  await expect(quote.button("אישור ההצעה")).toBeEnabled();
  await quote.transition("אישור ההצעה");
  const approved = await quotationDocument(
    await api.send(HTTP_METHODS.GET, `/quotation/${saved.id}`),
  );
  expect(approved.status).toBe(QUOTATION.STATUS.APPROVED);
  expect(approved.approvedById).toBe(lead.session.user.id);
});

for (const [name, viewport] of [
  ["desktop", { width: 1440, height: 900 }],
  ["mobile", { width: 390, height: 844 }],
] as const) {
  test(`${name} navigation and back link say תיקים and keep the board route`, async ({
    api,
    page,
  }) => {
    const project = await api.createProject(
      await buildStandaloneProjectInput(api, await seedCustomer(api)),
    );
    await page.setViewportSize(viewport);
    await page.goto(ROUTES.BOARD);
    const boardButton = page.getByRole("button", { name: NAVIGATION_COPY.BOARD, exact: true });
    await expect(boardButton).toBeVisible();
    await expect(page.getByRole("button", { name: "לוח בקרה", exact: true })).toHaveCount(0);
    await page.goto(`/projects/${project.id}`);
    const backToBoard = page.getByRole("link", { name: /חזרה לתיקים/ });
    await expect(backToBoard).toBeVisible();
    await backToBoard.click();
    await expect(page).toHaveURL(ROUTES.BOARD);
    await boardButton.click();
    await expect(page).toHaveURL(ROUTES.BOARD);
  });
}
