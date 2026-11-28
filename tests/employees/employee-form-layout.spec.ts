import {
  buildUserPath,
  buildBrowserApiPath,
  buildBrowserApiPattern,
} from "../../src/utilities/api-path.utility.ts";

import {
  createUniqueName,
  createMobilePhone,
  createUniqueEmail,
  createUniquePassword,
} from "../../src/utilities/test-data.utility.ts";

import { buildUserInput } from "../../src/api/seed-data.ts";
import { API_PATHS } from "../../src/constants/api.constant.ts";
import { test, expect } from "../../src/fixtures/test.fixture.ts";
import { VIEWPORTS } from "../../src/constants/viewport.constant.ts";
import { EMPLOYEES_COPY } from "../../src/constants/copy.constant.ts";
import { createEmployeesPage } from "../../src/pages/employees.page.ts";
import { KEYBOARD_KEYS } from "../../src/constants/keyboard.constant.ts";
import { HTTP_METHODS, HTTP_STATUS } from "../../src/constants/http.constant.ts";
import { MULTIPLE_ROLES_COPY } from "../../src/constants/multiple-roles.constant.ts";
import { USER_ROLES, USER_ROLE_LABELS } from "../../src/constants/user-role.constant.ts";
import { isWithinViewportWidth, readHorizontalOverflow } from "../../src/pages/layout.component.ts";

const DESKTOP_VIEWPORT = { width: 1600, height: 1000 } as const;
const CREATE_FAILURE = "QA simulated employee-creation conflict";
const newEmployee = () => ({
  role: USER_ROLES.FINANCE,
  name: createUniqueName("עובד בדיקה"),
  email: createUniqueEmail("employee"),
  phone: createMobilePhone(),
  password: createUniquePassword(),
});

for (const [size, viewport] of Object.entries({
  desktop: DESKTOP_VIEWPORT,
  mobile: VIEWPORTS.MOBILE,
})) {
  test(`employee list and creation popup fit the ${size} viewport`, async ({ page }, testInfo) => {
    await page.setViewportSize(viewport);
    const employees = createEmployeesPage(page);
    await employees.goto();
    await expect(
      page.getByRole("columnheader", { name: EMPLOYEES_COPY.PERSON_COLUMN }),
    ).toBeVisible();
    await expect(page.getByRole("row").nth(1)).toBeVisible();
    await expect(employees.searchBox).toBeVisible();
    await expect(page.getByText(EMPLOYEES_COPY.INTRO_HEADING, { exact: true })).toHaveCount(0);
    await expect(page.getByText(EMPLOYEES_COPY.INTRO_EYEBROW, { exact: true })).toHaveCount(0);
    await expect(employees.form).toHaveCount(0);
    await expect(page.getByPlaceholder(EMPLOYEES_COPY.NAME_PLACEHOLDER)).toHaveCount(0);
    await expect(employees.createButton).toBeInViewport();
    expect(await readHorizontalOverflow(page)).toBe(0);
    await page.screenshot({ path: testInfo.outputPath(`employee-list-${size}.png`) });

    await employees.createButton.click();
    await expect(employees.form).toHaveAccessibleName(EMPLOYEES_COPY.ADD_TITLE);
    await expect(employees.nameInput).toBeFocused();
    for (const field of [
      employees.nameInput,
      employees.emailInput,
      employees.phoneInput,
      employees.passwordInput,
      employees.passwordConfirmationInput,
      employees.rolePicker,
      employees.addButton,
    ]) {
      await expect(field).toBeVisible();
      expect(await isWithinViewportWidth(page, field)).toBe(true);
    }
    await expect(employees.addButton).toBeDisabled();
    await expect(employees.roleOptions).toHaveCount(0);
    expect(await readHorizontalOverflow(page)).toBe(0);
    await page.screenshot({ path: testInfo.outputPath(`employee-form-${size}.png`) });
    const employee = newEmployee();
    await employees.fillEmployee(employee);
    await employees.addButton.click();
    await expect(employees.form).toHaveCount(0);
    await employees.searchBox.fill(employee.email);
    await expect(employees.findRow(employee.email)).toBeVisible();
  });
}

test("role search supports keyboard selection, chip overflow and cancellation discards changes", async ({
  page,
}, testInfo) => {
  const employees = createEmployeesPage(page);
  await employees.goto();
  await employees.createButton.click();
  await employees.nameInput.fill("עובדת בדיקה");
  await employees.rolePicker.fill("unmatched search");
  await expect(page.getByText(EMPLOYEES_COPY.NO_MATCHING_ROLES)).toBeVisible();
  const roles = [USER_ROLES.FINANCE, USER_ROLES.SECRETARY];
  for (const role of roles) {
    await employees.rolePicker.fill(USER_ROLE_LABELS[role]);
    await expect(employees.roleOptions).toHaveCount(1);
    await employees.rolePicker.press(KEYBOARD_KEYS.ARROW_DOWN);
    await employees.rolePicker.press(KEYBOARD_KEYS.ENTER);
    await expect(employees.roleOption(role)).toHaveAttribute("aria-selected", "true");
  }
  await employees.closeRoles();
  await expect(employees.rolePicker).toBeFocused();
  await expect(employees.form.getByText("+1", { exact: true })).toBeVisible();
  await expect(
    employees.form.getByText(USER_ROLE_LABELS[USER_ROLES.ENGINEER], { exact: true }),
  ).toBeVisible();
  await expect(
    employees.form.getByText(USER_ROLE_LABELS[USER_ROLES.FINANCE], { exact: true }),
  ).toBeVisible();
  await expect(
    employees.form.getByText(USER_ROLE_LABELS[USER_ROLES.SECRETARY], { exact: true }),
  ).toBeHidden();
  await page.screenshot({ path: testInfo.outputPath("employee-role-summary.png") });
  await employees.openRoles();
  await page.screenshot({ path: testInfo.outputPath("employee-role-picker.png") });
  await employees.closeRoles();
  await expect(employees.form).toBeVisible();
  await page.keyboard.press(KEYBOARD_KEYS.ESCAPE);
  await expect(employees.form).toHaveCount(0);
  await expect(employees.createButton).toBeFocused();
  await employees.createButton.click();
  await expect(employees.nameInput).toHaveValue("");
  await employees.openRoles();
  await expect(employees.roleOption(USER_ROLES.ENGINEER)).toHaveAttribute("aria-selected", "true");
  for (const role of roles) {
    await expect(employees.roleOption(role)).toHaveAttribute("aria-selected", "false");
  }
});

test("create form blocks empty roles and keeps entered values after a request rejection", async ({
  page,
}) => {
  const employees = createEmployeesPage(page);
  await employees.goto();
  await employees.createButton.click();
  await employees.openRoles();
  await employees.roleOption(USER_ROLES.ENGINEER).click();
  await employees.closeRoles();
  await expect(employees.form.getByRole("alert")).toContainText(MULTIPLE_ROLES_COPY.REQUIRED);
  await expect(employees.addButton).toBeDisabled();

  const employee = newEmployee();
  await employees.fillEmployee(employee);
  await page.route(buildBrowserApiPattern(API_PATHS.USER), route =>
    route.request().method() === HTTP_METHODS.POST
      ? route.fulfill({ status: HTTP_STATUS.CONFLICT, json: { message: CREATE_FAILURE } })
      : route.continue(),
  );
  await employees.addButton.click();
  await expect(employees.form.getByRole("alert")).toContainText(CREATE_FAILURE);
  await expect(employees.nameInput).toHaveValue(employee.name);
  await expect(employees.emailInput).toHaveValue(employee.email);
  await employees.openRoles();
  await expect(employees.roleOption(USER_ROLES.FINANCE)).toHaveAttribute("aria-selected", "true");
});

test("edit preloads the employee profile, preserves roles and updates the original account", async ({
  page,
  api,
}, testInfo) => {
  const roles = [USER_ROLES.ENGINEER, USER_ROLES.FINANCE];
  const input = { ...buildUserInput(USER_ROLES.ENGINEER), assignedRoles: roles };
  const user = await api.createUser(input);
  const employees = createEmployeesPage(page);
  await employees.goto();
  await employees.searchBox.fill(user.email);
  const openEdit = (email: string) =>
    employees.findRow(email).getByRole("button", { name: EMPLOYEES_COPY.EDIT_EMPLOYEE }).click();
  await openEdit(user.email);
  await expect(employees.form).toHaveAccessibleName(EMPLOYEES_COPY.EDIT_EMPLOYEE);
  await expect(employees.nameInput).toHaveValue(`${user.firstName} ${user.lastName}`);
  await expect(employees.emailInput).toHaveValue(user.email);
  await expect(employees.phoneInput).toHaveValue(input.phone);
  await expect(employees.form.locator('input[type="password"]')).toHaveCount(0);
  for (const role of roles) {
    await expect(employees.form.getByText(USER_ROLE_LABELS[role], { exact: true })).toBeVisible();
  }
  await page.screenshot({ path: testInfo.outputPath("employee-edit.png") });
  const updatedEmail = createUniqueEmail("updated-employee");
  const phone = createMobilePhone();
  await expect(
    employees.form.getByRole("button", { name: MULTIPLE_ROLES_COPY.SAVE }),
  ).toBeDisabled();
  await employees.nameInput.fill("מיכל לוי");
  await employees.emailInput.fill(updatedEmail);
  await employees.phoneInput.fill(phone);
  const mutation = page.waitForResponse(
    response =>
      new URL(response.url()).pathname === buildBrowserApiPath(buildUserPath(user.id)) &&
      response.request().method() === HTTP_METHODS.PATCH,
  );
  await employees.form.getByRole("button", { name: MULTIPLE_ROLES_COPY.SAVE }).click();
  const response = await mutation;
  expect(response.ok()).toBe(true);
  expect(response.request().postDataJSON()).toEqual({
    firstName: "מיכל",
    lastName: "לוי",
    email: updatedEmail,
    phone,
  });
  await expect(employees.form).toHaveCount(0);
  await page.reload();
  await employees.searchBox.fill(updatedEmail);
  await openEdit(updatedEmail);
  await expect(employees.nameInput).toHaveValue("מיכל לוי");
  await expect(employees.phoneInput).toHaveValue(phone);
  const stored = await api.send(HTTP_METHODS.GET, buildUserPath(user.id));
  const profile = await stored.json();
  expect(profile.assignedRoles).toHaveLength(roles.length);
  expect(profile).toMatchObject({
    firstName: "מיכל",
    lastName: "לוי",
    email: updatedEmail,
    phone,
    role: roles[0],
    assignedRoles: expect.arrayContaining(roles),
  });
});
