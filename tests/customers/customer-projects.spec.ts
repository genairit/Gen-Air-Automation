import {
  CUSTOMER_PROJECTS_COPY,
  CUSTOMER_PROJECTS_VIEWPORTS,
} from "../../src/constants/customer-projects.constant.ts";

import { join } from "node:path";
import { test, expect } from "../../src/fixtures/test.fixture.ts";
import { selectOption } from "../../src/pages/select.component.ts";
import { HTTP_METHODS } from "../../src/constants/http.constant.ts";
import { USER_ROLES } from "../../src/constants/user-role.constant.ts";
import { createCustomersPage } from "../../src/pages/customers.page.ts";
import { TEST_USERS } from "../../src/constants/test-users.constant.ts";
import { createDeferred } from "../../src/utilities/deferred.utility.ts";
import { PERMISSIONS } from "../../src/constants/permission.constant.ts";
import { createProjectFormPage } from "../../src/pages/project-form.page.ts";
import { PROJECT_STATUS_NAMES } from "../../src/constants/domain.constant.ts";
import { withRolePermissions } from "../../src/environment/role-permissions.ts";
import { AUTOMATION_DIRECTORIES } from "../../src/constants/environment.constant.ts";
import { scopedApartmentNumber } from "../../src/utilities/apartment-fixture.utility.ts";
import { updateProjectRelationFixture } from "../../src/environment/customer-projects-data.ts";
import { seedCustomer, seedBuilding, seedStandaloneProject } from "../../src/api/seed-data.ts";
import { createCustomerProjectsComponent } from "../../src/pages/customer-projects.component.ts";

test("customer card follows grouping, five statuses, root/apartment navigation and mobile design", async ({
  api,
  page,
}) => {
  const customer = await seedCustomer(api);
  const other = await seedCustomer(api);
  const building = await seedBuilding(api, customer);
  const foreign = await seedBuilding(api, other);
  const project = await seedStandaloneProject(api, customer);
  await api.createApartment(building.id, {
    customerId: customer.id,
    customerFloor: 1,
    customerApartment: scopedApartmentNumber("101"),
  });
  const apartment = await api.createApartment(foreign.id, {
    customerId: customer.id,
    customerFloor: 2,
    customerApartment: scopedApartmentNumber("202"),
  });
  const card = createCustomerProjectsComponent(page);
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.setViewportSize(CUSTOMER_PROJECTS_VIEWPORTS.DESKTOP);
  await card.goto(customer.id);
  await expect(card.region.getByRole("link")).toHaveCount(3);
  await expect(card.region.getByText("1 דירות", { exact: true })).toBeVisible();
  await expect(
    card.region.getByText(`${foreign.name} · ${foreign.code} · קומה 2`, { exact: true }),
  ).toBeVisible();
  for (const status of Object.values(PROJECT_STATUS_NAMES)) {
    await expect(card.tab(status)).toBeVisible();
  }
  await card.region.screenshot({
    path: join(AUTOMATION_DIRECTORIES.RESULTS, "customer-projects-desktop.png"),
  });
  await card.link(project.name).click();
  await expect(page).toHaveURL(new RegExp(`/projects/${project.id}$`));
  await card.goto(customer.id);
  await card.link(building.name).click();
  await expect(page).toHaveURL(new RegExp(`/projects/${building.id}$`));
  await card.goto(customer.id);
  await card.region.getByRole("link").filter({ hasText: apartment.name }).click();
  await expect(page).toHaveURL(new RegExp(`/projects/${foreign.id}/apartments/${apartment.id}$`));
  await page.setViewportSize(CUSTOMER_PROJECTS_VIEWPORTS.MOBILE);
  await card.goto(customer.id);
  await expect(card.region.getByRole("link")).toHaveCount(3);
  await card.region.screenshot({
    path: join(AUTOMATION_DIRECTORIES.RESULTS, "customer-projects-mobile.png"),
  });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(errors).toEqual([]);
});

test("initial eight rows, bounded continuation, search/status reset and empty customer state", async ({
  api,
  page,
}) => {
  const customer = await seedCustomer(api);
  const empty = await seedCustomer(api);
  const projects = [];
  for (const _ of Array.from({ length: 19 })) {
    projects.push(await seedStandaloneProject(api, customer));
  }
  const first = projects[0];
  const pending = await api.findProjectStage(PROJECT_STATUS_NAMES.PENDING);
  expect(
    (await api.send(HTTP_METHODS.PATCH, `/project/${first.id}`, { stageId: pending.id })).ok(),
  ).toBe(true);
  const card = createCustomerProjectsComponent(page);
  await page.setViewportSize(CUSTOMER_PROJECTS_VIEWPORTS.DESKTOP);
  await card.goto(customer.id);
  await expect(card.region.getByRole("link")).toHaveCount(8);
  await card.more.scrollIntoViewIfNeeded();
  await expect(card.region.getByRole("link")).toHaveCount(18);
  await card.more.scrollIntoViewIfNeeded();
  await expect(card.region.getByRole("link")).toHaveCount(19);
  await expect(card.more).toHaveCount(0);
  await card.search.fill(first.code);
  await expect(card.region.getByRole("link")).toHaveCount(1);
  await expect(card.link(first.name)).toBeVisible();
  await card.search.fill("");
  await card.tab(PROJECT_STATUS_NAMES.PENDING).click();
  await expect(card.region.getByRole("link")).toHaveCount(1);
  await card.goto(empty.id);
  await expect(card.region.getByText(CUSTOMER_PROJECTS_COPY.EMPTY, { exact: true })).toBeVisible();
  await expect(card.region.getByRole("link")).toHaveCount(0);
});

test("empty/no-match states, long names and server-backed status mutation refresh related counts", async ({
  api,
  page,
}) => {
  const customer = await seedCustomer(api);
  const project = await seedStandaloneProject(api, customer);
  const longName = "שם פרויקט ארוך במיוחד ".repeat(8).trim();
  await updateProjectRelationFixture(project.id, { name: longName });
  const card = createCustomerProjectsComponent(page);
  await card.goto(customer.id);
  await expect(card.link(longName)).toBeVisible();
  await card.search.fill("no-such-project-anywhere");
  await expect(
    card.region.getByText(CUSTOMER_PROJECTS_COPY.NO_RESULTS, { exact: true }),
  ).toBeVisible();
  await card.region
    .getByRole("button", { name: CUSTOMER_PROJECTS_COPY.CLEAR, exact: true })
    .click();
  await expect(card.link(longName)).toBeVisible();
  const done = await api.findProjectStage(PROJECT_STATUS_NAMES.DONE);
  await selectOption(page, card.region.getByRole("combobox"), done.name);
  await expect.poll(async () => (await api.getProject(project.id)).stage.id).toBe(done.id);
  await card.tab(PROJECT_STATUS_NAMES.DONE).click();
  await expect(card.region.getByRole("link")).toHaveCount(1);
  await page.reload();
  await expect(card.region.getByRole("combobox")).toHaveValue(done.name);
  await page.setViewportSize(CUSTOMER_PROJECTS_VIEWPORTS.MOBILE);
  await expect(card.link(longName)).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test("loading and isolated list errors support retry, including failed continuation with cached rows", async ({
  api,
  page,
}) => {
  const customer = await seedCustomer(api);
  for (const _ of Array.from({ length: 10 })) {
    await seedStandaloneProject(api, customer);
  }
  const state = { initialFailures: 2, nextFailures: 2 };
  const card = createCustomerProjectsComponent(page);
  const pattern = `**/api/customer/${customer.id}/projects?*`;
  await page.route(pattern, async route => {
    const isContinuation = new URL(route.request().url()).searchParams.has("batchCursor");
    const phase = isContinuation ? "nextFailures" : "initialFailures";
    if (state[phase] > 0) {
      state[phase] -= 1;
      await route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({ message: "Temporary test failure" }),
      });
      return;
    }
    await route.continue();
  });
  await card.goto(customer.id);
  await expect(card.region.getByText(CUSTOMER_PROJECTS_COPY.ERROR, { exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: customer.name, exact: true })).toBeVisible();
  await card.retry.click();
  await expect(card.region.getByRole("link")).toHaveCount(8);
  await card.more.click();
  await expect(card.region.getByText(CUSTOMER_PROJECTS_COPY.ERROR, { exact: true })).toBeVisible();
  await expect(card.region.getByRole("link")).toHaveCount(8);
  await card.retry.click();
  await expect(card.region.getByRole("link")).toHaveCount(10);
});

test("read and status grants are independent and role revocation changes visible controls", async ({
  api,
  openPageAs,
}) => {
  const customer = await seedCustomer(api);
  await seedStandaloneProject(api, customer);
  await withRolePermissions(USER_ROLES.ENGINEER, [PERMISSIONS.CUSTOMERS_READ], async () => {
    const viewer = await openPageAs(TEST_USERS[USER_ROLES.ENGINEER]);
    const card = createCustomerProjectsComponent(viewer);
    await card.goto(customer.id);
    await expect(viewer.getByRole("heading", { name: customer.name, exact: true })).toBeVisible();
    await expect(card.region).toHaveCount(0);
    await withRolePermissions(
      USER_ROLES.ENGINEER,
      [PERMISSIONS.CUSTOMERS_READ, PERMISSIONS.PROJECTS_READ],
      async () => {
        await viewer.reload();
        await expect(card.region.getByRole("link")).toHaveCount(1);
        await expect(card.region.getByRole("combobox")).toBeDisabled();
        await withRolePermissions(
          USER_ROLES.ENGINEER,
          [
            PERMISSIONS.CUSTOMERS_READ,
            PERMISSIONS.PROJECTS_READ,
            PERMISSIONS.PROJECTS_STATUS_CHANGE,
          ],
          async () => {
            await viewer.reload();
            await expect(card.region.getByRole("combobox")).toBeEnabled();
          },
        );
        await viewer.reload();
        await expect(card.region.getByRole("combobox")).toBeDisabled();
      },
    );
    await viewer.reload();
    await expect(card.region).toHaveCount(0);
  });
});

test("pending project request shows loading without blocking customer details", async ({
  api,
  page,
}) => {
  const customer = await seedCustomer(api);
  await seedStandaloneProject(api, customer);
  const card = createCustomerProjectsComponent(page);
  const gate = createDeferred();
  await page.route(`**/api/customer/${customer.id}/projects?*`, async route => {
    await gate.promise;
    await route.continue();
  });
  try {
    await card.goto(customer.id);
    await expect(
      card.region.getByText(CUSTOMER_PROJECTS_COPY.LOADING, { exact: true }),
    ).toBeVisible();
    await expect(page.getByRole("heading", { name: customer.name, exact: true })).toBeVisible();
    gate.resolve();
    await expect(card.region.getByRole("link")).toHaveCount(1);
  } finally {
    gate.resolve();
  }
});

test("project reassignment refreshes the cached customer list through real client-side navigation", async ({
  api,
  page,
}) => {
  const customer = await seedCustomer(api);
  const other = await seedCustomer(api);
  const project = await seedStandaloneProject(api, customer);
  const card = createCustomerProjectsComponent(page);
  const customers = createCustomersPage(page);
  const form = createProjectFormPage(page);
  await card.goto(customer.id);
  await expect(card.region.getByRole("link")).toHaveCount(1);
  await card.link(project.name).click();
  await page.getByRole("button", { name: "עריכת פרויקט", exact: true }).click();
  await page
    .getByRole("button", { name: CUSTOMER_PROJECTS_COPY.REPLACE_CUSTOMER, exact: true })
    .click();
  await form.customerSearch.fill(other.name);
  await page.getByRole("option").filter({ hasText: other.name }).click();
  await form.saveButton.click();
  await expect(page).toHaveURL(new RegExp(`/projects/${project.id}$`));
  await page.getByRole("navigation").getByRole("button", { name: "לקוחות", exact: true }).click();
  await customers.searchBox.fill(customer.name);
  await customers.findRow(customer.name).click();
  await expect(card.region.getByText(CUSTOMER_PROJECTS_COPY.EMPTY, { exact: true })).toBeVisible();
  await expect(card.region.getByRole("link")).toHaveCount(0);
  await page.getByRole("link", { name: "→ חזרה ללקוחות", exact: true }).click();
  await customers.searchBox.fill(other.name);
  await customers.findRow(other.name).click();
  await expect(card.region.getByRole("link")).toHaveCount(1);
  await expect(card.link(project.name)).toBeVisible();
});
