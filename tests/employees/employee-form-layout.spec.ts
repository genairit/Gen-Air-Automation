import {
  readBoundingBox,
  isWithinViewportWidth,
  readHorizontalOverflow,
} from "../../src/pages/layout.component.ts";

import {
  createUniqueName,
  createMobilePhone,
  createUniqueEmail,
  createUniquePassword,
} from "../../src/utilities/test-data.utility.ts";

import {
  USER_ROLES,
  USER_ROLE_LABELS,
  ASSIGNABLE_USER_ROLE_VALUES,
} from "../../src/constants/user-role.constant.ts";

import { API_PATHS } from "../../src/constants/api.constant.ts";
import { test, expect } from "../../src/fixtures/test.fixture.ts";
import { HTTP_STATUS } from "../../src/constants/http.constant.ts";
import { VIEWPORTS } from "../../src/constants/viewport.constant.ts";
import { EMPLOYEES_COPY } from "../../src/constants/copy.constant.ts";
import { createEmployeesPage } from "../../src/pages/employees.page.ts";
import { buildBrowserApiPattern } from "../../src/utilities/api-path.utility.ts";
import { MULTIPLE_ROLES_COPY } from "../../src/constants/multiple-roles.constant.ts";

const DESKTOP_VIEWPORT = { width: 1600, height: 1000 } as const;
const ROW_ALIGNMENT_TOLERANCE = 4;
const CREATE_FAILURE = "QA simulated employee-creation conflict";

test("employee account and access sections form a compact desktop layout", async ({
  page,
}, testInfo) => {
  await page.setViewportSize(DESKTOP_VIEWPORT);
  const employees = createEmployeesPage(page);
  await employees.goto();

  const accountHeading = page.getByRole("heading", { name: EMPLOYEES_COPY.ACCOUNT_SECTION });
  const accessHeading = page.getByRole("heading", { name: EMPLOYEES_COPY.ACCESS_SECTION });
  const nameField = page.getByPlaceholder(EMPLOYEES_COPY.NAME_PLACEHOLDER);
  const emailField = page.getByPlaceholder(EMPLOYEES_COPY.EMAIL_PLACEHOLDER);
  const roleGroup = page.getByRole("group", { name: EMPLOYEES_COPY.ROLE_LABEL });
  await expect(page.getByText(EMPLOYEES_COPY.ADD_TITLE, { exact: true })).toBeVisible();
  await expect(accountHeading).toBeVisible();
  await expect(accessHeading).toBeVisible();
  await expect(nameField).toBeVisible();
  await expect(emailField).toBeVisible();
  await expect(roleGroup.getByRole("checkbox")).toHaveCount(ASSIGNABLE_USER_ROLE_VALUES.length);
  await expect(employees.addButton).toBeVisible();
  const accountBox = await readBoundingBox(accountHeading);
  const accessBox = await readBoundingBox(accessHeading);
  const nameBox = await readBoundingBox(nameField);
  const emailBox = await readBoundingBox(emailField);
  const adminBox = await readBoundingBox(employees.roleCheckbox(USER_ROLES.SYSTEM_ADMIN));
  const engineerBox = await readBoundingBox(employees.roleCheckbox(USER_ROLES.ENGINEER));
  const secretaryBox = await readBoundingBox(employees.roleCheckbox(USER_ROLES.SECRETARY));
  const projectManagerBox = await readBoundingBox(
    employees.roleCheckbox(USER_ROLES.PROJECT_MANAGER),
  );

  expect(accountBox.y).toBeLessThan(accessBox.y);
  expect(Math.abs(nameBox.y - emailBox.y)).toBeLessThan(ROW_ALIGNMENT_TOLERANCE);
  expect(Math.abs(adminBox.y - engineerBox.y)).toBeLessThan(ROW_ALIGNMENT_TOLERANCE);
  expect(Math.abs(engineerBox.y - secretaryBox.y)).toBeLessThan(ROW_ALIGNMENT_TOLERANCE);
  expect(projectManagerBox.y).toBeGreaterThan(adminBox.y);
  expect(nameBox.width).toBeLessThan(DESKTOP_VIEWPORT.width / 2);
  expect(await readHorizontalOverflow(page)).toBe(0);
  await page.screenshot({ path: testInfo.outputPath("employee-form-desktop.png"), fullPage: true });
});

test("employee form stays readable and actionable at 390px", async ({ page }, testInfo) => {
  await page.setViewportSize(VIEWPORTS.MOBILE);
  const employees = createEmployeesPage(page);
  await employees.goto();

  const accountHeading = page.getByRole("heading", { name: EMPLOYEES_COPY.ACCOUNT_SECTION });
  const accessHeading = page.getByRole("heading", { name: EMPLOYEES_COPY.ACCESS_SECTION });
  const nameField = page.getByPlaceholder(EMPLOYEES_COPY.NAME_PLACEHOLDER);
  const emailField = page.getByPlaceholder(EMPLOYEES_COPY.EMAIL_PLACEHOLDER);
  await expect(accountHeading).toBeVisible();
  await expect(accessHeading).toBeVisible();
  await expect(nameField).toBeVisible();
  await expect(emailField).toBeVisible();
  await expect(employees.addButton).toBeVisible();
  await expect(employees.roleOptions).toHaveCount(ASSIGNABLE_USER_ROLE_VALUES.length);
  const adminBox = await readBoundingBox(employees.roleCheckbox(USER_ROLES.SYSTEM_ADMIN));
  const engineerBox = await readBoundingBox(employees.roleCheckbox(USER_ROLES.ENGINEER));
  const secretaryBox = await readBoundingBox(employees.roleCheckbox(USER_ROLES.SECRETARY));
  const accountBox = await readBoundingBox(accountHeading);
  const accessBox = await readBoundingBox(accessHeading);
  const nameBox = await readBoundingBox(nameField);
  const emailBox = await readBoundingBox(emailField);
  const buttonBox = await readBoundingBox(employees.addButton);

  expect(accountBox.y).toBeLessThan(accessBox.y);
  expect(nameBox.y).toBeLessThan(emailBox.y);
  expect(Math.abs(adminBox.y - engineerBox.y)).toBeLessThan(ROW_ALIGNMENT_TOLERANCE);
  expect(secretaryBox.y).toBeGreaterThan(adminBox.y);
  expect(buttonBox.width).toBeGreaterThan(VIEWPORTS.MOBILE.width * 0.75);
  expect(await isWithinViewportWidth(page, employees.addButton)).toBe(true);
  expect(await readHorizontalOverflow(page)).toBe(0);
  await page.screenshot({ path: testInfo.outputPath("employee-form-mobile.png"), fullPage: true });

  const employee = {
    role: USER_ROLES.ENGINEER,
    phone: createMobilePhone(),
    password: createUniquePassword(),
    name: createUniqueName("עובד נייד"),
    email: createUniqueEmail("mobile-employee"),
  };
  await employees.addEmployee(employee);
  await expect(employees.findRow(employee.email)).toBeVisible();
});

test("role tiles are assignment-only and can be selected across the whole tile", async ({
  page,
}) => {
  const employees = createEmployeesPage(page);
  await employees.goto();

  const roleGroup = page.getByRole("group", { name: EMPLOYEES_COPY.ROLE_LABEL });
  const finance = employees.roleCheckbox(USER_ROLES.FINANCE);
  await expect(employees.roleCheckbox(USER_ROLES.ENGINEER)).toBeChecked();
  await expect(roleGroup.getByRole("radio")).toHaveCount(0);

  const financeTile = roleGroup.locator(":scope > div").filter({
    hasText: USER_ROLE_LABELS[USER_ROLES.FINANCE],
  });
  const tileBox = await readBoundingBox(financeTile);
  await financeTile.click({ position: { x: tileBox.width / 2, y: tileBox.height - 8 } });
  await expect(finance).toBeChecked();
  await expect(
    financeTile.getByRole("checkbox", { name: USER_ROLE_LABELS[USER_ROLES.FINANCE] }),
  ).toHaveCount(1);
  await expect(roleGroup.getByRole("radio")).toHaveCount(0);
  await expect(roleGroup.getByText("פעיל", { exact: true })).toHaveCount(0);
});

test("create form blocks empty roles and keeps entered values after a request rejection", async ({
  page,
}) => {
  const employees = createEmployeesPage(page);
  await employees.goto();

  const engineer = employees.roleCheckbox(USER_ROLES.ENGINEER);
  await engineer.uncheck();
  await expect(page.getByRole("alert")).toContainText(MULTIPLE_ROLES_COPY.REQUIRED);
  await expect(employees.addButton).toBeDisabled();

  const employee = {
    role: USER_ROLES.FINANCE,
    phone: createMobilePhone(),
    password: createUniquePassword(),
    name: createUniqueName("עובד שגיאת שרת"),
    email: createUniqueEmail("rejected-employee"),
  };
  await page.route(buildBrowserApiPattern(API_PATHS.USER), route =>
    route.fulfill({ status: HTTP_STATUS.CONFLICT, json: { message: CREATE_FAILURE } }),
  );
  await employees.addEmployee(employee);
  await expect(page.getByRole("alert").filter({ hasText: CREATE_FAILURE })).toBeVisible();
  await expect(page.getByPlaceholder(EMPLOYEES_COPY.NAME_PLACEHOLDER)).toHaveValue(employee.name);
  await expect(page.getByPlaceholder(EMPLOYEES_COPY.EMAIL_PLACEHOLDER)).toHaveValue(employee.email);
  await expect(employees.roleCheckbox(USER_ROLES.FINANCE)).toBeChecked();
  await page.unroute(buildBrowserApiPattern(API_PATHS.USER));
});
