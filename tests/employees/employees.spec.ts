import {
  createUniqueName,
  createMobilePhone,
  createUniqueEmail,
} from "../../src/utilities/test-data.utility.ts";

import { seedUser } from "../../src/api/seed-data.ts";
import { ROUTES } from "../../src/constants/routes.constant.ts";
import { createLoginPage } from "../../src/pages/login.page.ts";
import { readTabCount } from "../../src/pages/tab.component.ts";
import { test, expect } from "../../src/fixtures/test.fixture.ts";
import { USER_ROLES } from "../../src/constants/user-role.constant.ts";
import { createEmployeesPage } from "../../src/pages/employees.page.ts";
import { expectSingleResultRow } from "../../src/pages/table.component.ts";
import { EMPTY_AUTH_STATE } from "../../src/constants/auth-state.constant.ts";

const NEW_EMPLOYEE_PREFIXES = { NAME: "עובדת חדשה", EMAIL: "new-employee" } as const;

test("add an employee, see it in the table and count it under its role", async ({ page, api }) => {
  const employeesPage = createEmployeesPage(page);
  const employee = {
    role: USER_ROLES.SECRETARY,
    phone: createMobilePhone(),
    name: createUniqueName(NEW_EMPLOYEE_PREFIXES.NAME),
    email: createUniqueEmail(NEW_EMPLOYEE_PREFIXES.EMAIL),
  };

  await employeesPage.goto();
  await employeesPage.addEmployee(employee);

  await expect(employeesPage.findRow(employee.email)).toBeVisible();

  const roleCount = await api.countUsersInRole(employee.role);

  await expect.poll(() => readTabCount(employeesPage.roleTab(employee.role))).toBe(roleCount);
});

test("delete an employee removes it from the table", async ({ page, api }) => {
  const employee = await seedUser(api, USER_ROLES.LEAD_INSTALLER);
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
    const employee = await seedUser(api, USER_ROLES.LEAD_INSTALLER);
    const loginPage = createLoginPage(page);

    await loginPage.goto();
    await loginPage.login(employee);

    await expect(loginPage.heading).toBeHidden();
  });
});
