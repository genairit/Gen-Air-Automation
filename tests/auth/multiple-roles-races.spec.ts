import { seedCustomer } from "../../src/api/seed-data.ts";
import { ROUTES } from "../../src/constants/routes.constant.ts";
import { API_PATHS } from "../../src/constants/api.constant.ts";
import { createBoardPage } from "../../src/pages/board.page.ts";
import { createLoginPage } from "../../src/pages/login.page.ts";
import { seedMultiRoleUser } from "../../src/api/multi-role.ts";
import { test, expect } from "../../src/fixtures/test.fixture.ts";
import { HTTP_METHODS } from "../../src/constants/http.constant.ts";
import { NAVIGATION_COPY } from "../../src/constants/copy.constant.ts";
import { createRoleMenu } from "../../src/pages/role-menu.component.ts";
import { createEmployeesPage } from "../../src/pages/employees.page.ts";
import { KEYBOARD_KEYS } from "../../src/constants/keyboard.constant.ts";
import { delayApiResponse } from "../../src/mocks/delayed-response.mock.ts";
import { withRolePermissions } from "../../src/environment/role-permissions.ts";
import { refreshVisibility } from "../../src/utilities/browser-event.utility.ts";
import { MULTIPLE_ROLES_COPY } from "../../src/constants/multiple-roles.constant.ts";
import { USER_ROLES, USER_ROLE_LABELS } from "../../src/constants/user-role.constant.ts";
import { PERMISSIONS, PERMISSION_COPY } from "../../src/constants/permission.constant.ts";
import { buildUserPath, buildBrowserApiPattern } from "../../src/utilities/api-path.utility.ts";

const ADMIN = USER_ROLES.SYSTEM_ADMIN;
const FINANCE = USER_ROLES.FINANCE;

test("a stale current-user refresh cannot overwrite a more recent successful role switch", async ({
  api,
  openPageAs,
}) => {
  const user = await seedMultiRoleUser(api, [ADMIN, FINANCE], ADMIN);
  const page = await openPageAs(user);
  await page.goto(ROUTES.BOARD);
  const board = createBoardPage(page);
  await expect(board.newProjectButton).toBeVisible();
  const delayed = await delayApiResponse({ page, path: API_PATHS.MY_USER });
  try {
    await refreshVisibility(page);
    await delayed.received;
    await createRoleMenu(page).select(FINANCE);
    await expect(board.newProjectButton).toHaveCount(0);
    await delayed.releaseAndWaitForApplication();
    const menu = createRoleMenu(page);
    await menu.open();
    await expect(menu.option(FINANCE)).toHaveAttribute("aria-checked", "true");
    await page.keyboard.press(KEYBOARD_KEYS.ESCAPE);
    await expect(board.searchBox).toBeVisible();
    await expect(board.newProjectButton).toHaveCount(0);
  } finally {
    delayed.release();
  }
});

for (const status of [200, 401, 403]) {
  test(`a late ${status} role-switch response cannot replace or clear a newly logged-in account`, async ({
    api,
    openPageAs,
  }) => {
    const first = await seedMultiRoleUser(api, [ADMIN, FINANCE]);
    const second = await seedMultiRoleUser(api, [ADMIN, FINANCE]);
    const page = await openPageAs(first);
    await page.goto(ROUTES.BOARD);
    await expect(createBoardPage(page).newProjectButton).toBeVisible();
    const delayed = await delayApiResponse({ page, path: API_PATHS.SWITCH_ROLE, status });
    try {
      await createRoleMenu(page).select(FINANCE);
      await delayed.received;
      await page.keyboard.press(KEYBOARD_KEYS.ESCAPE);
      await page.getByRole("button", { name: NAVIGATION_COPY.LOGOUT, exact: true }).click();
      const login = createLoginPage(page);
      await expect(login.heading).toBeVisible();
      await login.login(second);
      await expect(createBoardPage(page).newProjectButton).toBeVisible();
      await delayed.releaseAndWaitForApplication();
      const menu = createRoleMenu(page);
      await expect(menu.trigger).toContainText(second.firstName);
      await menu.open();
      await expect(menu.option(ADMIN)).toHaveAttribute("aria-checked", "true");
      await page.keyboard.press(KEYBOARD_KEYS.ESCAPE);
      await expect(createBoardPage(page).newProjectButton).toBeVisible();
      await expect(login.heading).toHaveCount(0);
    } finally {
      delayed.release();
    }
  });
}

test("a late restricted query cannot repopulate visible customer data after switching roles", async ({
  api,
  openPageAs,
}) => {
  const user = await seedMultiRoleUser(api, [ADMIN, FINANCE], ADMIN);
  const customer = await seedCustomer(api);
  await withRolePermissions(FINANCE, [PERMISSIONS.TASKS_READ], async () => {
    const page = await openPageAs(user);
    const delayed = await delayApiResponse({ page, path: API_PATHS.CUSTOMER });
    try {
      await page.goto(ROUTES.CUSTOMERS);
      await delayed.received;
      await createRoleMenu(page).select(FINANCE);
      await expect(page.getByText(PERMISSION_COPY.DENIED, { exact: true })).toBeVisible();
      await delayed.releaseAndWaitForApplication();
      await expect(page.getByText(customer.name, { exact: true })).toHaveCount(0);
      await expect(page.getByText(PERMISSION_COPY.DENIED, { exact: true })).toBeVisible();
      await createRoleMenu(page).select(ADMIN);
      await expect(page.getByText(customer.name, { exact: true })).toBeVisible();
    } finally {
      delayed.release();
    }
  });
});

test("a completed employee mutation cannot run its success-close callback after revocation", async ({
  api,
  apiAs,
  openPageAs,
}) => {
  const user = await seedMultiRoleUser(api, [ADMIN, FINANCE], ADMIN);
  const employee = await seedMultiRoleUser(api, [USER_ROLES.ENGINEER]);
  const actor = await apiAs(user);
  const page = await openPageAs(user);
  const employees = createEmployeesPage(page);
  await employees.goto();
  await employees.searchBox.fill(employee.email);
  await employees
    .findRow(employee.email)
    .getByRole("button", { name: MULTIPLE_ROLES_COPY.EDIT })
    .click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("checkbox", { name: USER_ROLE_LABELS[FINANCE], exact: true }).check();
  const delayed = await delayApiResponse({ page, path: buildUserPath(employee.id) });
  try {
    await dialog.getByRole("button", { name: MULTIPLE_ROLES_COPY.SAVE }).click();
    const response = await delayed.received;
    expect(response.status()).toBe(200);
    const persisted = await api.send(HTTP_METHODS.GET, buildUserPath(employee.id));
    expect(persisted.status()).toBe(200);
    expect(await persisted.json()).toMatchObject({
      role: USER_ROLES.ENGINEER,
      assignedRoles: expect.arrayContaining([USER_ROLES.ENGINEER, FINANCE]),
    });
    expect(
      (
        await api.send(HTTP_METHODS.PATCH, buildUserPath(user.id), {
          assignedRoles: [FINANCE],
        })
      ).status(),
    ).toBe(200);
    await refreshVisibility(page);
    await expect(
      page.getByRole("button", {
        name: new RegExp(user.firstName),
        includeHidden: true,
      }),
    ).toBeDisabled();
    await delayed.releaseAndWaitForApplication();
    await expect(dialog).toBeVisible();
    await expect(
      dialog
        .getByRole("alert")
        .filter({
          hasText: MULTIPLE_ROLES_COPY.CONTEXT_CHANGED,
        })
        .first(),
    ).toBeVisible();
    expect(await (await actor.send(HTTP_METHODS.GET, API_PATHS.MY_USER)).json()).toMatchObject({
      role: FINANCE,
      assignedRoles: [FINANCE],
    });
  } finally {
    delayed.release();
  }
});

for (const status of [400, 403, 500]) {
  test(`a ${status} switch failure reports the error, retains the role, and allows recovery`, async ({
    api,
    openPageAs,
  }) => {
    const user = await seedMultiRoleUser(api, [ADMIN, FINANCE], ADMIN);
    const page = await openPageAs(user);
    await page.goto(ROUTES.BOARD);
    const board = createBoardPage(page);
    await expect(board.newProjectButton).toBeVisible();
    const pattern = buildBrowserApiPattern(API_PATHS.SWITCH_ROLE);
    await page.route(pattern, route =>
      route.fulfill({
        status,
        json: { message: `QA simulated switch failure ${status}` },
      }),
    );
    const menu = createRoleMenu(page);
    await menu.select(FINANCE);
    await expect(page.getByRole("alert")).toContainText(`QA simulated switch failure ${status}`);
    await expect(menu.option(ADMIN)).toHaveAttribute("aria-checked", "true");
    await page.keyboard.press(KEYBOARD_KEYS.ESCAPE);
    await expect(menu.menu).toHaveCount(0);
    await expect(board.newProjectButton).toBeVisible();
    await page.unroute(pattern);
    await menu.select(FINANCE);
    await expect(menu.menu).toHaveCount(0);
    await expect(board.newProjectButton).toHaveCount(0);
  });
}

test("pending switching disables duplicate choices and a late success cannot restore a logged-out session", async ({
  api,
  openPageAs,
}) => {
  const user = await seedMultiRoleUser(api, [ADMIN, FINANCE]);
  const page = await openPageAs(user);
  await page.goto(ROUTES.BOARD);
  await expect(createBoardPage(page).newProjectButton).toBeVisible();
  const delayed = await delayApiResponse({ page, path: API_PATHS.SWITCH_ROLE });
  try {
    const menu = createRoleMenu(page);
    await menu.select(FINANCE);
    await delayed.received;
    await expect(menu.option(ADMIN)).toBeDisabled();
    await expect(menu.option(FINANCE)).toBeDisabled();
    await expect(menu.option(ADMIN)).toHaveAttribute("aria-checked", "true");
    await page.keyboard.press(KEYBOARD_KEYS.ESCAPE);
    await page.getByRole("button", { name: NAVIGATION_COPY.LOGOUT, exact: true }).click();
    await expect(createLoginPage(page).heading).toBeVisible();
    await delayed.releaseAndWaitForApplication();
    await expect(createLoginPage(page).heading).toBeVisible();
    await expect(createBoardPage(page).searchBox).toHaveCount(0);
  } finally {
    delayed.release();
  }
});

test("a current 401 role-switch failure signs out and removes protected content", async ({
  api,
  openPageAs,
}) => {
  const user = await seedMultiRoleUser(api, [ADMIN, FINANCE]);
  const page = await openPageAs(user);
  await page.goto(ROUTES.BOARD);
  await expect(createBoardPage(page).newProjectButton).toBeVisible();
  await page.route(buildBrowserApiPattern(API_PATHS.SWITCH_ROLE), route =>
    route.fulfill({
      status: 401,
      json: { message: "QA simulated expired session" },
    }),
  );
  await createRoleMenu(page).select(FINANCE);
  await expect(createLoginPage(page).heading).toBeVisible();
  await expect(createBoardPage(page).searchBox).toHaveCount(0);
});
