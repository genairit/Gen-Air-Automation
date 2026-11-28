import {
  createUniqueName,
  createMobilePhone,
  createUniqueEmail,
  createUniquePassword,
} from "../../src/utilities/test-data.utility.ts";

import {
  USER_ROLES,
  USER_ROLE_LABELS,
  type UserRoleType,
  ASSIGNABLE_USER_ROLE_VALUES,
} from "../../src/constants/user-role.constant.ts";

import type { Response } from "@playwright/test";
import { seedUser } from "../../src/api/seed-data.ts";
import { isRecord } from "../../src/utilities/guard.utility.ts";
import { ROUTES } from "../../src/constants/routes.constant.ts";
import { createLoginPage } from "../../src/pages/login.page.ts";
import { readTabCount } from "../../src/pages/tab.component.ts";
import { test, expect } from "../../src/fixtures/test.fixture.ts";
import { HTTP_METHODS } from "../../src/constants/http.constant.ts";
import { VIEWPORTS } from "../../src/constants/viewport.constant.ts";
import { EMPLOYEES_COPY } from "../../src/constants/copy.constant.ts";
import { createEmployeesPage } from "../../src/pages/employees.page.ts";
import { isUserRecord } from "../../src/utilities/entity-guard.utility.ts";
import { EMPTY_AUTH_STATE } from "../../src/constants/auth-state.constant.ts";
import { expectSingleResultRow, expectResultRowCount } from "../../src/pages/table.component.ts";

interface IEmployeeRoleSearchExpectation {
  email: string;
  role: UserRoleType;
  expectedEmails: string[];
}

const NEW_EMPLOYEE_PREFIXES = { NAME: "עובדת חדשה", EMAIL: "new-employee" } as const;

for (const role of ASSIGNABLE_USER_ROLE_VALUES) {
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

test("the role picker offers only assignable roles", async ({ page }) => {
  const employeesPage = createEmployeesPage(page);

  await employeesPage.goto();

  await expect(employeesPage.roleTab(USER_ROLES.SALES_AGENT)).toHaveCount(0);
  await employeesPage.openCreate();
  await employeesPage.openRoles();
  await expect(employeesPage.roleOptions).toHaveCount(ASSIGNABLE_USER_ROLE_VALUES.length);
  await expect(employeesPage.roleOption(USER_ROLES.SALES_AGENT)).toHaveCount(0);
  for (const role of ASSIGNABLE_USER_ROLE_VALUES) {
    await expect(employeesPage.roleOption(role)).toHaveAccessibleName(USER_ROLE_LABELS[role]);
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
  await employeesPage.openCreate();
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

test("the role filters narrow the table to assignable roles", async ({ page, api }) => {
  const employeesPage = createEmployeesPage(page);
  const employees = await Promise.all(ASSIGNABLE_USER_ROLE_VALUES.map(role => seedUser(api, role)));

  const filteredResponses = new Map<string, Response>();
  page.on("response", (response): void => {
    const url = new URL(response.url());
    const isRead = response.request().method() === HTTP_METHODS.GET;
    const isUsersPath = url.pathname.endsWith("/user");
    if (!isRead || !isUsersPath) {
      return;
    }
    const key = JSON.stringify({
      role: url.searchParams.get("role"),
      email: url.searchParams.get("search"),
    });
    filteredResponses.set(key, response);
  });
  await employeesPage.goto();

  const expectRoleSearch = async ({
    role,
    email,
    expectedEmails,
  }: IEmployeeRoleSearchExpectation): Promise<void> => {
    const key = JSON.stringify({ role, email });
    await employeesPage.roleTab(role).click();
    await employeesPage.searchBox.fill(email);
    await expect.poll((): boolean => filteredResponses.has(key)).toBe(true);
    const response = filteredResponses.get(key);
    if (!response) {
      throw new Error("Missing the actual employee role/search response");
    }
    expect(response.status()).toBe(200);
    const body: unknown = await response.json();
    if (!isRecord(body) || !Array.isArray(body.items) || !body.items.every(isUserRecord)) {
      throw new Error("Expected a filtered employee page with assigned roles");
    }
    expect(body.items.map((user): string => user.email)).toEqual(expectedEmails);
    await expectResultRowCount(page, expectedEmails.length);
  };

  for (const employee of employees) {
    const included =
      employee.role === USER_ROLES.ENGINEER
        ? employees.filter((candidate): boolean =>
            [USER_ROLES.ENGINEER, USER_ROLES.ENGINEERING_LEAD].some(
              (role): boolean => role === candidate.role,
            ),
          )
        : [employee];
    for (const matching of included) {
      await expectRoleSearch({
        role: employee.role,
        email: matching.email,
        expectedEmails: [matching.email],
      });
      await expect(employeesPage.findRow(matching.email)).toBeVisible();
    }
    const excludedRole =
      employee.role === USER_ROLES.ENGINEER ? USER_ROLES.SECRETARY : USER_ROLES.ENGINEER;
    const excluded = employees.find((candidate): boolean => candidate.role === excludedRole);
    if (!excluded) {
      throw new Error("Missing employee outside the selected role's eligibility group");
    }
    await expectRoleSearch({ role: employee.role, email: excluded.email, expectedEmails: [] });
    await expect(employeesPage.findRow(excluded.email)).toHaveCount(0);
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
  await expect(employeesPage.findRow(employee.email)).toBeVisible();
  await expectSingleResultRow(page);

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
      await expect(button).toBeVisible();
      const bounds = await button.boundingBox();
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
