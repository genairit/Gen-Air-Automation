import {
  buildUserPath,
  buildBrowserApiPath,
  buildBrowserApiPattern,
} from "../../src/utilities/api-path.utility.ts";

import {
  createUniqueName,
  createUniqueEmail,
  createMobilePhone,
  createUniquePassword,
} from "../../src/utilities/test-data.utility.ts";

import {
  USER_ROLES,
  USER_ROLE_LABELS,
  ASSIGNABLE_USER_ROLE_VALUES,
} from "../../src/constants/user-role.constant.ts";

import { seedMultiRoleUser } from "../../src/api/multi-role.ts";
import { ROUTES } from "../../src/constants/routes.constant.ts";
import { API_PATHS } from "../../src/constants/api.constant.ts";
import { test, expect } from "../../src/fixtures/test.fixture.ts";
import { HTTP_METHODS } from "../../src/constants/http.constant.ts";
import { createEmployeesPage } from "../../src/pages/employees.page.ts";
import { refreshVisibility } from "../../src/utilities/browser-event.utility.ts";
import { MULTIPLE_ROLES_COPY } from "../../src/constants/multiple-roles.constant.ts";
import { createTestDatabaseClient } from "../../src/environment/test-database-client.ts";

const ADMIN = USER_ROLES.SYSTEM_ADMIN;
const FINANCE = USER_ROLES.FINANCE;
const ENGINEER = USER_ROLES.ENGINEER;

test("admin creates a multi-role account and the server activates the first assigned role", async ({
  api,
  page,
  apiAs,
}) => {
  const employee = {
    role: ENGINEER,
    assignedRoles: [ENGINEER, FINANCE],
    name: createUniqueName("עובד רב תפקידים"),
    email: createUniqueEmail("multi-role"),
    phone: createMobilePhone(),
    password: createUniquePassword(),
  };
  const before = await api.readRoleCounts();
  const employees = createEmployeesPage(page);
  await employees.goto();
  await employees.addEmployee(employee);
  await employees.searchBox.fill(employee.email);
  await expect(employees.findRow(employee.email)).toBeVisible();
  const actor = await apiAs({ email: employee.email, password: employee.password });
  expect(actor.session.user.role).toBe(ENGINEER);
  expect([...actor.session.user.assignedRoles].sort()).toEqual([ENGINEER, FINANCE].sort());
  const after = await api.readRoleCounts();
  expect(after.total).toBe(before.total + 1);
  expect(after[ENGINEER]).toBe(before[ENGINEER] + 1);
  expect(after[FINANCE]).toBe(before[FINANCE] + 1);
  await page.reload();
  await employees.roleTab(ENGINEER).click();
  await employees.searchBox.fill(employee.email);
  await expect(employees.findRow(employee.email)).toBeVisible();
  await employees.roleTab(FINANCE).click();
  await expect(employees.findRow(employee.email)).toBeVisible();
});

test("admin edits assigned roles without choosing an active role and receives a fallback", async ({
  api,
  page,
  apiAs,
}) => {
  const user = await seedMultiRoleUser(api, [ENGINEER]);
  const employees = createEmployeesPage(page);
  await employees.goto();
  await employees.searchBox.fill(user.email);
  const row = employees.findRow(user.email);
  await row.getByRole("button", { name: MULTIPLE_ROLES_COPY.EDIT }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("checkbox")).toHaveCount(ASSIGNABLE_USER_ROLE_VALUES.length);
  await expect(dialog.getByRole("radio")).toHaveCount(0);
  await dialog.getByRole("checkbox", { name: USER_ROLE_LABELS[FINANCE], exact: true }).check();
  await expect(dialog.getByRole("radio")).toHaveCount(0);
  await dialog.getByRole("button", { name: MULTIPLE_ROLES_COPY.SAVE }).click();
  await expect(dialog).toHaveCount(0);
  const actor = await apiAs(user);
  expect(actor.session.user.role).toBe(ENGINEER);
  expect([...actor.session.user.assignedRoles].sort()).toEqual([ENGINEER, FINANCE].sort());
  await page.reload();
  await employees.searchBox.fill(user.email);
  await expect(
    employees.findRow(user.email).getByText(USER_ROLE_LABELS[ENGINEER], { exact: true }),
  ).toHaveCount(2);
  await expect(
    employees.findRow(user.email).getByText(USER_ROLE_LABELS[FINANCE], { exact: true }),
  ).toBeVisible();

  await employees
    .findRow(user.email)
    .getByRole("button", { name: MULTIPLE_ROLES_COPY.EDIT })
    .click();
  await dialog.getByRole("checkbox", { name: USER_ROLE_LABELS[ENGINEER], exact: true }).uncheck();
  await expect(dialog.getByRole("radio")).toHaveCount(0);
  await dialog.getByRole("button", { name: MULTIPLE_ROLES_COPY.SAVE }).click();
  await expect(dialog).toHaveCount(0);
  expect((await apiAs(user)).session.user.role).toBe(FINANCE);
});

test("empty assignments block saving and a server rejection retains the edit and entered selections", async ({
  api,
  page,
}) => {
  const user = await seedMultiRoleUser(api, [ENGINEER]);
  const employees = createEmployeesPage(page);
  await employees.goto();
  await employees.searchBox.fill(user.email);
  await employees
    .findRow(user.email)
    .getByRole("button", { name: MULTIPLE_ROLES_COPY.EDIT })
    .click();
  const dialog = page.getByRole("dialog");
  const engineer = dialog.getByRole("checkbox", { name: USER_ROLE_LABELS[ENGINEER], exact: true });
  const finance = dialog.getByRole("checkbox", { name: USER_ROLE_LABELS[FINANCE], exact: true });
  const save = dialog.getByRole("button", { name: MULTIPLE_ROLES_COPY.SAVE });
  await engineer.uncheck();
  await expect(dialog.getByRole("alert")).toContainText(MULTIPLE_ROLES_COPY.REQUIRED);
  await expect(save).toBeDisabled();
  await finance.check();
  await page.route(buildBrowserApiPattern(buildUserPath(user.id)), route =>
    route.fulfill({
      status: 409,
      json: { message: "QA simulated role-assignment conflict" },
    }),
  );
  await save.click();
  await expect(dialog).toBeVisible();
  await expect(
    dialog.getByRole("alert").filter({ hasText: "QA simulated role-assignment conflict" }),
  ).toBeVisible();
  await expect(finance).toBeChecked();
  await expect(engineer).not.toBeChecked();
  await page.unroute(buildBrowserApiPattern(buildUserPath(user.id)));
  const stored = await api.send(HTTP_METHODS.GET, buildUserPath(user.id));
  expect(await stored.json()).toMatchObject({ role: ENGINEER, assignedRoles: [ENGINEER] });
});

test("revoked active administrator loses employee actions after focus without another login", async ({
  api,
  openPageAs,
}) => {
  const user = await seedMultiRoleUser(api, [ADMIN, FINANCE]);
  const page = await openPageAs(user);
  const employees = createEmployeesPage(page);
  await employees.goto();
  await expect(employees.addButton).toBeVisible();
  expect(
    (
      await api.send(HTTP_METHODS.PATCH, buildUserPath(user.id), {
        assignedRoles: [FINANCE],
      })
    ).status(),
  ).toBe(200);
  await refreshVisibility(page);
  await expect(employees.addButton).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: MULTIPLE_ROLES_COPY.EDIT, exact: true }),
  ).toHaveCount(0);
  await expect(page.getByRole("button", { name: new RegExp(user.firstName) })).toBeDisabled();
  await page.goto(ROUTES.EMPLOYEES);
  await expect(employees.searchBox).toBeVisible();
  await expect(employees.addButton).toHaveCount(0);
});

test("removing the final administrator is rejected visibly and retains the unsaved choices", async ({
  api,
  page,
}) => {
  const database = createTestDatabaseClient();
  await database.connect();
  const hidden = await database.query<{ id: string }>(
    `UPDATE users SET deleted_at = now()
     WHERE id <> $1 AND deleted_at IS NULL
       AND id IN (SELECT user_id FROM user_roles WHERE role = $2)
     RETURNING id`,
    [api.session.user.id, ADMIN],
  );
  try {
    const employees = createEmployeesPage(page);
    await employees.goto();
    await employees.searchBox.fill(api.session.user.email);
    await employees
      .findRow(api.session.user.email)
      .getByRole("button", { name: MULTIPLE_ROLES_COPY.EDIT })
      .click();
    const dialog = page.getByRole("dialog");
    const admin = dialog.getByRole("checkbox", { name: USER_ROLE_LABELS[ADMIN], exact: true });
    const finance = dialog.getByRole("checkbox", { name: USER_ROLE_LABELS[FINANCE], exact: true });
    await finance.check();
    await admin.uncheck();
    const rejected = page.waitForResponse(
      response =>
        new URL(response.url()).pathname ===
          buildBrowserApiPath(buildUserPath(api.session.user.id)) &&
        response.request().method() === HTTP_METHODS.PATCH,
    );
    await dialog.getByRole("button", { name: MULTIPLE_ROLES_COPY.SAVE }).click();
    expect((await rejected).status()).toBe(409);
    await expect(
      dialog.getByRole("alert").filter({
        hasText: "At least one active system administrator must remain",
      }),
    ).toBeVisible();
    await expect(finance).toBeChecked();
    await expect(admin).not.toBeChecked();
    expect(await (await api.send(HTTP_METHODS.GET, API_PATHS.MY_USER)).json()).toMatchObject({
      role: ADMIN,
      assignedRoles: [ADMIN],
    });
  } finally {
    try {
      await database.query("UPDATE users SET deleted_at = NULL WHERE id = ANY($1::uuid[])", [
        hidden.rows.map(row => row.id),
      ]);
    } finally {
      await database.end();
    }
  }
});
