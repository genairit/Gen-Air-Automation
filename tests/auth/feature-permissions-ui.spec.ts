import {
  seedBuilding,
  seedCustomer,
  seedApartment,
  seedTaskScenario,
  seedStandaloneProject,
} from "../../src/api/seed-data.ts";

import {
  SETTINGS_COPY,
  TASK_FORM_COPY,
  NAVIGATION_COPY,
} from "../../src/constants/copy.constant.ts";

import type { Page } from "@playwright/test";
import { ROUTES } from "../../src/constants/routes.constant.ts";
import { createBoardPage } from "../../src/pages/board.page.ts";
import { createLoginPage } from "../../src/pages/login.page.ts";
import { test, expect } from "../../src/fixtures/test.fixture.ts";
import { HTTP_METHODS } from "../../src/constants/http.constant.ts";
import { createProjectPage } from "../../src/pages/project.page.ts";
import { USER_ROLES } from "../../src/constants/user-role.constant.ts";
import { TEST_USERS } from "../../src/constants/test-users.constant.ts";
import { createDeferred } from "../../src/utilities/deferred.utility.ts";
import { LOCAL_STORAGE_KEYS } from "../../src/constants/storage.constant.ts";
import { createProjectFormPage } from "../../src/pages/project-form.page.ts";
import { PROJECT_STATUS_NAMES } from "../../src/constants/domain.constant.ts";
import { mockDriveManagement } from "../../src/mocks/drive-management.mock.ts";
import { withRolePermissions } from "../../src/environment/role-permissions.ts";
import { createTaskFormPage, createTaskPage } from "../../src/pages/tasks.page.ts";
import { createDriveManagement } from "../../src/pages/drive-management.component.ts";
import { PERMISSIONS, PERMISSION_COPY } from "../../src/constants/permission.constant.ts";
import { createApartmentPage, createApartmentFormPage } from "../../src/pages/apartment.page.ts";

const FINANCE = USER_ROLES.FINANCE;
const ADMIN = USER_ROLES.SYSTEM_ADMIN;
const refreshVisibility = (page: Page) =>
  page.evaluate(() => window.dispatchEvent(new Event("visibilitychange")));

const captureRequests = (page: Page) => {
  const requests: string[] = [];
  page.on("request", request => requests.push(new URL(request.url()).pathname));
  return requests;
};

test("grant changes on focus update controls and navigation without another login", async ({
  openPageAs,
  apiAs,
}) => {
  const actor = await apiAs(TEST_USERS[FINANCE]);
  const page = await openPageAs(TEST_USERS[FINANCE]);
  const board = createBoardPage(page);
  await board.goto();
  await expect(board.searchBox).toBeVisible();
  await expect(board.newTaskButton).toBeDisabled();
  await withRolePermissions(
    FINANCE,
    [...actor.session.user.permissions, PERMISSIONS.TASKS_CREATE],
    async () => {
      await refreshVisibility(page);
      await expect(board.newTaskButton).toBeEnabled();
      await board.newTaskButton.click();
      await expect(page.getByRole("button", { name: TASK_FORM_COPY.SAVE })).toBeVisible();
    },
  );
  await page.getByRole("button", { name: NAVIGATION_COPY.BOARD, exact: true }).click();
  await refreshVisibility(page);
  await expect(board.newTaskButton).toBeDisabled();
});

test("a real forbidden write refreshes current grants and removes the stale action", async ({
  api,
  openPageAs,
  apiAs,
}) => {
  const { task } = await seedTaskScenario(api);
  const actor = await apiAs(TEST_USERS[ADMIN]);
  const page = await openPageAs(TEST_USERS[ADMIN]);
  const view = createTaskPage(page);
  await view.goto(task.id);
  await expect(view.markUrgentButton).toBeVisible();
  await withRolePermissions(
    ADMIN,
    actor.session.user.permissions.filter(key => key !== PERMISSIONS.TASKS_URGENCY_CHANGE),
    async () => {
      const forbidden = page.waitForResponse(
        response =>
          new URL(response.url()).pathname === `/api/task/${task.id}/urgency` &&
          response.status() === 403,
      );
      await view.markUrgent();
      await forbidden;
      await expect(view.markUrgentButton).toHaveCount(0);
      await expect(view.descriptionInput).toBeVisible();
    },
  );
});

test("legacy stored sessions wait for verification before protected content is mounted", async ({
  page,
  apiAs,
}) => {
  const actor = await apiAs(TEST_USERS[FINANCE]);
  const { permissions, ...legacyUser } = actor.session.user;
  expect(permissions.length).toBeGreaterThan(0);
  const gate = createDeferred();
  const requests = captureRequests(page);
  await page.addInitScript(
    ({ key, session }) => localStorage.setItem(key, JSON.stringify(session)),
    {
      key: LOCAL_STORAGE_KEYS.SESSION,
      session: { ...actor.session, user: legacyUser },
    },
  );
  await page.route("**/api/user/me", async route => {
    await gate.promise;
    await route.continue();
  });
  try {
    await page.goto(ROUTES.BOARD);
    await expect(page.getByText(PERMISSION_COPY.LOADING)).toBeVisible();
    expect(requests.some(path => path === "/api/project")).toBe(false);
    await expect(createBoardPage(page).searchBox).toHaveCount(0);
    gate.resolve();
    await expect(createBoardPage(page).searchBox).toBeVisible();
    await expect(createBoardPage(page).newProjectButton).toHaveCount(0);
  } finally {
    gate.resolve();
  }
});

for (const stored of [
  "{not-json",
  JSON.stringify({ accessToken: "bad", user: { permissions: ["unknown.permission"] } }),
]) {
  test(`malformed session is discarded (${stored.startsWith("{") ? stored.length : "invalid"})`, async ({
    page,
  }) => {
    await page.addInitScript(({ key, value }) => localStorage.setItem(key, value), {
      key: LOCAL_STORAGE_KEYS.SESSION,
      value: stored,
    });
    await page.goto(ROUTES.BOARD);
    await expect(createLoginPage(page).heading).toBeVisible();
    await expect(createBoardPage(page).searchBox).toHaveCount(0);
  });
}

test("current-user verification failure stays closed and can retry", async ({ page }) => {
  await page.route("**/api/user/me", route =>
    route.fulfill({ status: 503, json: { message: "Temporary QA outage" } }),
  );
  await page.goto(ROUTES.BOARD);
  await expect(page.getByText(PERMISSION_COPY.ERROR, { exact: true })).toBeVisible();
  await expect(createBoardPage(page).searchBox).toHaveCount(0);
  await page.unroute("**/api/user/me");
  await page.getByRole("button", { name: "נסה שוב", exact: true }).click();
  await expect(createBoardPage(page).searchBox).toBeVisible();
});

test("switching accounts cannot reuse the previous account's permissions or customer cache", async ({
  page,
  api,
}) => {
  const customer = await seedCustomer(api);
  await page.goto(ROUTES.CUSTOMERS);
  await expect(page.getByText(customer.name, { exact: true })).toBeVisible();
  await page.getByText(NAVIGATION_COPY.LOGOUT, { exact: true }).click();
  const login = createLoginPage(page);
  await expect(login.heading).toBeVisible();
  await withRolePermissions(FINANCE, [PERMISSIONS.TASKS_READ], async () => {
    await login.login(TEST_USERS[FINANCE]);
    await expect(page.getByText(PERMISSION_COPY.DENIED, { exact: true })).toBeVisible();
    await expect(page.getByText(customer.name, { exact: true })).toHaveCount(0);
    await expect(createBoardPage(page).newProjectButton).toHaveCount(0);
    await page.goto(ROUTES.CUSTOMERS);
    await expect(page.getByText(PERMISSION_COPY.DENIED, { exact: true })).toBeVisible();
    await expect(page.getByText(customer.name, { exact: true })).toHaveCount(0);
  });
});

test("independent task grants keep content editable while assignment and urgency are absent", async ({
  api,
  apiAs,
  openPageAs,
}) => {
  const { task } = await seedTaskScenario(api);
  const actor = await apiAs(TEST_USERS[ADMIN]);
  const keys = actor.session.user.permissions.filter(
    key =>
      ![PERMISSIONS.TASKS_ASSIGN, PERMISSIONS.TASKS_URGENCY_CHANGE].some(denied => denied === key),
  );
  await withRolePermissions(ADMIN, keys, async () => {
    const page = await openPageAs(TEST_USERS[ADMIN]);
    const view = createTaskPage(page);
    await view.goto(task.id);
    await expect(view.descriptionInput).toBeEnabled();
    await expect(view.assigneeSelect).toHaveCount(0);
    await expect(view.markUrgentButton).toHaveCount(0);
    await view.descriptionInput.fill("QA content remains editable");
    await view.saveDescriptionButton.click();
    await expect
      .poll(async () => (await api.getTask(task.id)).description)
      .toBe("QA content remains editable");
    const form = createTaskFormPage(page);
    await form.goto();
    await form.assigneePicker.click();
    await expect(page.getByRole("option")).toHaveCount(1);
    await expect(page.getByText("דחיפות המשימה", { exact: true })).toHaveCount(0);
  });
});

test("apartments can be created without project-edit permission and denied routes stay closed", async ({
  api,
  apiAs,
  openPageAs,
}) => {
  const building = await seedBuilding(api, await seedCustomer(api));
  const customer = await seedCustomer(api);
  const actor = await apiAs(TEST_USERS[FINANCE]);
  await withRolePermissions(
    FINANCE,
    [...actor.session.user.permissions, PERMISSIONS.APARTMENTS_CREATE],
    async () => {
      const page = await openPageAs(TEST_USERS[FINANCE]);
      const project = createProjectPage(page);
      await project.goto(building.id);
      await expect(project.editButton).toHaveCount(0);
      await project.addApartmentButton.click();
      const form = createApartmentFormPage(page);
      await form.fill({ floor: "5", number: "47א", customerName: customer.name });
      await form.submitButton.click();
      await expect(page).toHaveURL(new RegExp(`/projects/${building.id}$`));
      await expect(project.findApartmentRow("47א")).toBeVisible();
    },
  );
  const page = await openPageAs(TEST_USERS[FINANCE]);
  await page.goto(`/projects/${building.id}/apartments/new`);
  await expect(page.getByText(PERMISSION_COPY.DENIED, { exact: true })).toBeVisible();
});

test("status grant is separate from project edit in form, apartment tabs and bulk controls", async ({
  api,
  apiAs,
  openPageAs,
}) => {
  const building = await seedBuilding(api, await seedCustomer(api));
  const apartment = await seedApartment(api, building);
  const { project } = await seedTaskScenario(api);
  const actor = await apiAs(TEST_USERS[ADMIN]);
  await withRolePermissions(
    ADMIN,
    actor.session.user.permissions.filter(key => key !== PERMISSIONS.PROJECTS_STATUS_CHANGE),
    async () => {
      const page = await openPageAs(TEST_USERS[ADMIN]);
      const form = createProjectFormPage(page);
      await form.gotoEdit(project.id);
      const update = page.waitForRequest(
        request =>
          request.method() === HTTP_METHODS.PATCH &&
          new URL(request.url()).pathname === `/api/project/${project.id}`,
      );
      await form.nameInput.fill("QA ordinary project edit");
      await form.saveButton.click();
      expect((await update).postDataJSON()).not.toHaveProperty("stageId");
      await expect(page.getByRole("heading", { name: "QA ordinary project edit" })).toBeVisible();
      const view = createApartmentPage(page);
      await view.goto(building.id, apartment.id);
      await expect(view.stageTab(PROJECT_STATUS_NAMES.IN_PROGRESS)).toBeDisabled();
      const buildingPage = createProjectPage(page);
      await buildingPage.goto(building.id);
      await buildingPage.findApartmentRow(apartment.name).getByRole("checkbox").check();
      await expect(page.getByRole("combobox", { name: "שנה שלב ל…" })).toHaveCount(0);
    },
  );
});

for (const building of [false, true]) {
  test(`nested Drive/tasks denied grants mount no forbidden queries (${building ? "building" : "standalone"})`, async ({
    api,
    apiAs,
    openPageAs,
  }) => {
    const customer = await seedCustomer(api);
    const project = await (building
      ? seedBuilding(api, customer)
      : seedStandaloneProject(api, customer));
    const actor = await apiAs(TEST_USERS[FINANCE]);
    await withRolePermissions(
      FINANCE,
      actor.session.user.permissions.filter(
        key => ![PERMISSIONS.DRIVE_READ, PERMISSIONS.TASKS_READ].some(denied => denied === key),
      ),
      async () => {
        const page = await openPageAs(TEST_USERS[FINANCE]);
        const requests = captureRequests(page);
        const view = createProjectPage(page);
        await view.goto(project.id);
        await expect(view.heading(project.name)).toBeVisible();
        await expect(view.driveCard).toHaveCount(0);
        await expect(page.getByRole("heading", { name: "משימות הפרויקט" })).toHaveCount(0);
        expect(
          requests.some(
            path => path.startsWith("/api/project-drive/") || path.startsWith("/api/task"),
          ),
        ).toBe(false);
      },
    );
  });
}

test("settings password remains accessible with no project read permission", async ({
  apiAs,
  openPageAs,
}) => {
  const actor = await apiAs(TEST_USERS[FINANCE]);
  await withRolePermissions(
    FINANCE,
    actor.session.user.permissions.filter(key => key !== PERMISSIONS.PROJECTS_READ),
    async () => {
      const page = await openPageAs(TEST_USERS[FINANCE]);
      const requests = captureRequests(page);
      await page.goto(ROUTES.SETTINGS);
      await expect(page.getByPlaceholder(SETTINGS_COPY.NEW_PASSWORD_PLACEHOLDER)).toBeVisible();
      await expect(page.getByRole("heading", { name: SETTINGS_COPY.STAGES_TITLE })).toHaveCount(0);
      expect(requests.some(path => path === "/api/project-stage")).toBe(false);
    },
  );
});

for (const grant of [PERMISSIONS.DRIVE_UPLOAD, PERMISSIONS.DRIVE_MOVE, PERMISSIONS.DRIVE_DELETE]) {
  test(`Drive action ${grant} is independent of project editing and other Drive mutations`, async ({
    api,
    apiAs,
    openPageAs,
  }) => {
    const project = await seedStandaloneProject(api, await seedCustomer(api));
    const actor = await apiAs(TEST_USERS[FINANCE]);
    const keys = actor.session.user.permissions.filter(key => key !== PERMISSIONS.DRIVE_UPLOAD);
    await withRolePermissions(FINANCE, [...keys, grant], async () => {
      const page = await openPageAs(TEST_USERS[FINANCE]);
      await mockDriveManagement(page, project.id);
      const view = createDriveManagement(page);
      await view.goto(project.id);
      await view.expandNested();
      await expect(view.file).toBeVisible();
      await expect(view.editButton).toHaveCount(0);
      await expect(view.uploadInput).toHaveCount(grant === PERMISSIONS.DRIVE_UPLOAD ? 1 : 0);
      if (grant === PERMISSIONS.DRIVE_UPLOAD) {
        await expect(view.move).toHaveCount(0);
        await expect(view.trash).toHaveCount(0);
        return;
      }
      await expect(view.move).toBeEnabled({ enabled: grant === PERMISSIONS.DRIVE_MOVE });
      await expect(view.trash).toBeEnabled({ enabled: grant === PERMISSIONS.DRIVE_DELETE });
    });
  });
}
