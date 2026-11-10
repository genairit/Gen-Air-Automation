import {
  createUniqueName,
  createMobilePhone,
  createUniqueEmail,
  createUniquePassword,
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
import { VIEWPORTS } from "../../src/constants/viewport.constant.ts";
import { EMPLOYEES_COPY } from "../../src/constants/copy.constant.ts";
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
      password: createUniquePassword(),
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

test("the role picker offers exactly the seven roles", async ({ page }) => {
  const employeesPage = createEmployeesPage(page);

  await employeesPage.goto();

  await expect(employeesPage.roleOptions).toHaveCount(USER_ROLE_VALUES.length);
  for (const role of USER_ROLE_VALUES) {
    await expect(employeesPage.roleCheckbox(role)).toHaveAccessibleName(USER_ROLE_LABELS[role]);
  }
});

test("employee creation requires matching chosen password and the new account can use it", async ({
  page,
  apiAs,
}) => {
  const employeesPage = createEmployeesPage(page);
  const employee = {
    role: USER_ROLES.SECRETARY,
    phone: "+442071838750",
    password: createUniquePassword(),
    name: createUniqueName(NEW_EMPLOYEE_PREFIXES.NAME),
    email: createUniqueEmail(NEW_EMPLOYEE_PREFIXES.EMAIL),
  };

  await employeesPage.goto();
  await expect(employeesPage.passwordInput).toBeVisible();
  await expect(employeesPage.passwordConfirmationInput).toBeVisible();
  await employeesPage.fillEmployee({
    ...employee,
    passwordConfirmation: `${employee.password}x`,
  });

  await expect(employeesPage.addButton).toBeDisabled();
  await employeesPage.passwordConfirmationInput.fill(employee.password);
  await expect(employeesPage.addButton).toBeEnabled();
  await employeesPage.addButton.click();

  await expect(employeesPage.findRow(employee.email)).toBeVisible();
  await expect(
    employeesPage.findRow(employee.email).locator('a[href="tel:+442071838750"]'),
  ).toBeVisible();
  const actor = await apiAs(employee);
  expect(actor.session.user.email).toBe(employee.email);
});

test("the role filters narrow the table to each of the seven roles", async ({ page, api }) => {
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

test("employee edit and delete actions fit inside their table cell on desktop and mobile", async ({
  page,
  api,
}) => {
  const employee = await seedUser(api, USER_ROLES.PROJECT_MANAGER);
  const employeesPage = createEmployeesPage(page);

  await employeesPage.goto();
  await employeesPage.searchBox.fill(employee.email);

  const actionCell = employeesPage.findRow(employee.email).getByRole("cell").last();
  const actions = [EMPLOYEES_COPY.EDIT_EMPLOYEE, EMPLOYEES_COPY.DELETE_EMPLOYEE];

  for (const viewport of [null, VIEWPORTS.MOBILE]) {
    if (viewport) {
      await page.setViewportSize(viewport);
    }

    await actionCell.scrollIntoViewIfNeeded();
    const cellBounds = await actionCell.boundingBox();

    if (!cellBounds) {
      throw new Error("Employee action cell is not visible");
    }

    for (const name of actions) {
      const button = actionCell.getByRole("button", { name });
      const bounds = await button.boundingBox();

      await expect(button).toBeVisible();
      if (!bounds) {
        throw new Error(`${name} is not visible`);
      }

      expect(bounds.x).toBeGreaterThanOrEqual(cellBounds.x);
      expect(bounds.x + bounds.width).toBeLessThanOrEqual(cellBounds.x + cellBounds.width);
    }
  }
});

test.describe("signed out", () => {
  test.use({ storageState: EMPTY_AUTH_STATE });

  test("a seeded employee can log in with its assigned password", async ({ page, api }) => {
    const employee = await seedUser(api, USER_ROLES.INSTALLER);
    const loginPage = createLoginPage(page);

    await loginPage.goto();
    await loginPage.login(employee);

    await expect(loginPage.heading).toBeHidden();
  });
});
