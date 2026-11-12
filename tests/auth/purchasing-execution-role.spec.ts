import { API_PATHS } from "../../src/constants/api.constant.ts";
import { ROUTES } from "../../src/constants/routes.constant.ts";
import { createBoardPage } from "../../src/pages/board.page.ts";
import { test, expect } from "../../src/fixtures/test.fixture.ts";
import { HTTP_METHODS } from "../../src/constants/http.constant.ts";
import { TEST_USERS } from "../../src/constants/test-users.constant.ts";
import { createRoleMenu } from "../../src/pages/role-menu.component.ts";
import { createEmployeesPage } from "../../src/pages/employees.page.ts";
import { PERMISSIONS } from "../../src/constants/permission.constant.ts";
import { seedMultiRoleUser, switchRole } from "../../src/api/multi-role.ts";
import { withRolePermissions } from "../../src/environment/role-permissions.ts";
import { USER_ROLES, USER_ROLE_LABELS } from "../../src/constants/user-role.constant.ts";
import { seedCustomer, seedStandaloneProject, buildUserInput } from "../../src/api/seed-data.ts";

const ADMIN = USER_ROLES.SYSTEM_ADMIN;
const PURCHASING = USER_ROLES.PURCHASING_EXECUTION_MANAGER;

const purchasingKeys = [
  PERMISSIONS.BOQ_TEMPLATES_MANAGE,
  PERMISSIONS.SUPPLIER_AGREEMENTS_MANAGE,
  PERMISSIONS.PURCHASE_REQUESTS_REVIEW,
  PERMISSIONS.PURCHASE_ORDERS_APPROVE,
  PERMISSIONS.PURCHASE_ORDERS_SEND,
  PERMISSIONS.EXECUTION_HANDOFFS_MANAGE,
];

test("purchasing account has the exact company-wide read and action grants but no payment grants", async ({
  api,
  apiAs,
}) => {
  const customerA = await seedCustomer(api);
  const customerB = await seedCustomer(api);
  const projectA = await seedStandaloneProject(api, customerA);
  const projectB = await seedStandaloneProject(api, customerB);
  const actor = await apiAs(TEST_USERS[PURCHASING]);
  expect(actor.session.user.role).toBe(PURCHASING);
  expect(actor.session.user.permissions).toEqual(
    expect.arrayContaining([
      PERMISSIONS.PROJECTS_READ,
      PERMISSIONS.CUSTOMERS_READ,
      PERMISSIONS.TASKS_READ,
      PERMISSIONS.EMPLOYEES_READ,
      PERMISSIONS.DRIVE_READ,
      PERMISSIONS.QUOTATIONS_READ,
      ...purchasingKeys,
    ]),
  );
  expect(actor.session.user.permissions).toHaveLength(12);
  for (const key of [PERMISSIONS.SUBCONTRACTOR_SETTLEMENTS_APPROVE, PERMISSIONS.PAYMENTS_RECORD]) {
    expect(actor.session.user.permissions).not.toContain(key);
  }
  for (const project of [projectA, projectB]) {
    expect((await actor.send(HTTP_METHODS.GET, `/project/${project.id}`)).status()).toBe(200);
    expect(
      (await actor.send(HTTP_METHODS.PATCH, `/project/${project.id}`, { name: "Denied" })).status(),
    ).toBe(403);
  }
  for (const path of [API_PATHS.PROJECT, API_PATHS.CUSTOMER, API_PATHS.TASK, API_PATHS.USER]) {
    expect((await actor.send(HTTP_METHODS.GET, path)).status()).toBe(200);
  }
  expect(
    (await actor.send(HTTP_METHODS.POST, API_PATHS.USER, buildUserInput(ADMIN))).status(),
  ).toBe(403);
});

test("purchasing read disappears immediately when its database grant is revoked", async ({
  apiAs,
}) => {
  const actor = await apiAs(TEST_USERS[PURCHASING]);
  expect((await actor.send(HTTP_METHODS.GET, API_PATHS.PROJECT)).status()).toBe(200);
  await withRolePermissions(PURCHASING, [], async () => {
    expect((await actor.send(HTTP_METHODS.GET, API_PATHS.PROJECT)).status()).toBe(403);
    expect((await actor.send(HTTP_METHODS.GET, API_PATHS.CUSTOMER)).status()).toBe(403);
    expect((await actor.send(HTTP_METHODS.GET, API_PATHS.MY_USER)).status()).toBe(200);
    expect(
      (await (await actor.send(HTTP_METHODS.GET, API_PATHS.MY_USER)).json()).permissions,
    ).toEqual([]);
  });
  expect((await actor.send(HTTP_METHODS.GET, API_PATHS.PROJECT)).status()).toBe(200);
});

test("admin assigns purchasing role, employee filter finds it, and switch updates visible actions", async ({
  api,
  apiAs,
  openPageAs,
  page,
}) => {
  const user = await seedMultiRoleUser(api, [ADMIN, PURCHASING]);
  const employees = createEmployeesPage(page);
  await employees.goto();
  await employees.roleTab(PURCHASING).click();
  await employees.searchBox.fill(user.email);
  await expect(employees.findRow(user.email)).toBeVisible();
  await expect(employees.findRow(user.email)).toContainText(USER_ROLE_LABELS[PURCHASING]);

  const actor = await apiAs(user);
  expect((await switchRole(actor, PURCHASING)).status()).toBe(200);
  expect(
    (await (await actor.send(HTTP_METHODS.GET, API_PATHS.MY_USER)).json()).permissions,
  ).toEqual(expect.arrayContaining(purchasingKeys));
  expect(
    (await actor.send(HTTP_METHODS.POST, API_PATHS.USER, buildUserInput(ADMIN))).status(),
  ).toBe(403);
  const actorPage = await openPageAs(user);
  await actorPage.goto(ROUTES.BOARD);
  const board = createBoardPage(actorPage);
  await expect(board.searchBox).toBeVisible();
  await expect(board.newProjectButton).toHaveCount(0);
  const menu = createRoleMenu(actorPage);
  await menu.open();
  await expect(menu.option(PURCHASING)).toHaveAttribute("aria-checked", "true");
  await menu.option(ADMIN).click();
  await expect(board.newProjectButton).toBeVisible();
  await actorPage.reload();
  await expect(menu.trigger).toContainText(USER_ROLE_LABELS[ADMIN]);
});

test("purchasing role cannot be selected until assigned and revocation removes it from the active session", async ({
  api,
  apiAs,
}) => {
  const user = await seedMultiRoleUser(api, [ADMIN]);
  const actor = await apiAs(user);
  expect((await switchRole(actor, PURCHASING)).status()).toBe(400);
  expect(
    (
      await api.send(HTTP_METHODS.PATCH, `/user/${user.id}`, {
        assignedRoles: [ADMIN, PURCHASING],
      })
    ).status(),
  ).toBe(200);
  expect((await switchRole(actor, PURCHASING)).status()).toBe(200);
  expect((await actor.send(HTTP_METHODS.GET, API_PATHS.PROJECT)).status()).toBe(200);
  expect(
    (await api.send(HTTP_METHODS.PATCH, `/user/${user.id}`, { assignedRoles: [ADMIN] })).status(),
  ).toBe(200);
  expect((await switchRole(actor, PURCHASING)).status()).toBe(400);
  expect((await (await actor.send(HTTP_METHODS.GET, API_PATHS.MY_USER)).json()).role).toBe(ADMIN);
});
