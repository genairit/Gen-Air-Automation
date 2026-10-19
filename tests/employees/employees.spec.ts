import {
  createUniqueName,
  createMobilePhone,
  createUniqueEmail,
} from "../../src/utilities/test-data.utility.ts";

import {
  USER_ROLES,
  USER_ROLE_LABELS,
  USER_ROLE_VALUES,
} from "../../src/constants/user-role.constant.ts";

import { seedUser } from "../../src/api/seed-data.ts";
import { ROUTES } from "../../src/constants/routes.constant.ts";
import { createLoginPage } from "../../src/pages/login.page.ts";
import { readTabCount } from "../../src/pages/tab.component.ts";
import { test, expect } from "../../src/fixtures/test.fixture.ts";
import { createEmployeesPage } from "../../src/pages/employees.page.ts";
import { expectSingleResultRow } from "../../src/pages/table.component.ts";
import { EMPTY_AUTH_STATE } from "../../src/constants/auth-state.constant.ts";

const NEW_EMPLOYEE_PREFIXES = { NAME: "עובדת חדשה", EMAIL: "new-employee" } as const;

for (const role of USER_ROLE_VALUES) {
  test(`add a ${role} employee, see it in the table and count it under its role`, async ({
    page,
    api,
  }) => {
    const employeesPage = createEmployeesPage(page);
    const employee = {
      role,
      phone: createMobilePhone(),
      name: createUniqueName(NEW_EMPLOYEE_PREFIXES.NAME),
      email: createUniqueEmail(NEW_EMPLOYEE_PREFIXES.EMAIL),
    };

    await employeesPage.goto();
    await employeesPage.addEmployee(employee);

    await expect(employeesPage.findRow(employee.email)).toBeVisible();
    await expect(employeesPage.findRow(employee.email)).toContainText(USER_ROLE_LABELS[role]);

    const roleCount = await api.countUsersInRole(role);

    await expect.poll(() => readTabCount(employeesPage.roleTab(role))).toBe(roleCount);
  });
}

test("the role picker offers exactly the six roles", async ({ page }) => {
  const employeesPage = createEmployeesPage(page);

  await employeesPage.goto();

  await expect(await employeesPage.openRoleOptions()).toHaveText(
    USER_ROLE_VALUES.map(role => USER_ROLE_LABELS[role]),
  );
});

test("the role filters narrow the table to each of the six roles", async ({ page, api }) => {
  const employeesPage = createEmployeesPage(page);
  const employees = await Promise.all(USER_ROLE_VALUES.map(role => seedUser(api, role)));

  await employeesPage.goto();

  for (const [index, employee] of employees.entries()) {
    const otherRoleEmployee = employees[(index + 1) % employees.length];

    await employeesPage.roleTab(employee.role).click();
    await employeesPage.searchBox.fill(employee.email);

    await expect(employeesPage.findRow(employee.email)).toBeVisible();

    await employeesPage.searchBox.fill(otherRoleEmployee.email);

    await expect(employeesPage.findRow(otherRoleEmployee.email)).toHaveCount(0);
  }
});

test("delete an employee removes it from the table", async ({ page, api }) => {
  const employee = await seedUser(api, USER_ROLES.INSTALLER);
  const employeesPage = createEmployeesPage(page);

  await employeesPage.goto();
  await employeesPage.searchBox.fill(employee.email);
  await employeesPage.deleteEmployee(employee.email);

  await expect(employeesPage.findRow(employee.email)).toHaveCount(0);

  await page.goto(ROUTES.EMPLOYEES);
  await employeesPage.searchBox.fill(employee.email);

  await expect(employeesPage.findRow(employee.email)).toHaveCount(0);
});

test("search narrows the employees table", async ({ page, api }) => {
  const employee = await seedUser(api, USER_ROLES.PROJECT_MANAGER);
  const employeesPage = createEmployeesPage(page);

  await employeesPage.goto();
  await employeesPage.searchBox.fill(employee.email);

  await expect(employeesPage.findRow(employee.email)).toBeVisible();
  await expectSingleResultRow(page);
});

test.describe("signed out", () => {
  test.use({ storageState: EMPTY_AUTH_STATE });

  test("a newly added employee can log in with the temporary password", async ({ page, api }) => {
    const employee = await seedUser(api, USER_ROLES.INSTALLER);
    const loginPage = createLoginPage(page);

    await loginPage.goto();
    await loginPage.login(employee);

    await expect(loginPage.heading).toBeHidden();
  });
});
