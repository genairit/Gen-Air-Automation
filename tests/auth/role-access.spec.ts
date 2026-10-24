import type { Locator } from "@playwright/test";
import { ROUTES } from "../../src/constants/routes.constant.ts";
import { createBoardPage } from "../../src/pages/board.page.ts";
import { test, expect } from "../../src/fixtures/test.fixture.ts";
import { TEST_USERS } from "../../src/constants/test-users.constant.ts";
import { ROLE_ACCESS } from "../../src/constants/role-access.constant.ts";
import { TASK_STATUS_NAMES } from "../../src/constants/domain.constant.ts";
import { USER_ROLE_VALUES } from "../../src/constants/user-role.constant.ts";
import { getAuthStatePath } from "../../src/utilities/auth-state.utility.ts";
import { createProjectFormPage } from "../../src/pages/project-form.page.ts";
import { assignTaskBypassingApi } from "../../src/environment/legacy-data.ts";
import { createTaskPage, createTasksPage } from "../../src/pages/tasks.page.ts";
import { TASKS_COPY, EMPLOYEES_COPY } from "../../src/constants/copy.constant.ts";
import { createCustomersPage, createCustomerFormPage } from "../../src/pages/customers.page.ts";
import { seedCustomer, seedTaskScenario, seedStandaloneProject } from "../../src/api/seed-data.ts";

const TASK_MANAGEMENT_DENIED_ROLES = USER_ROLE_VALUES.filter(
  role => !ROLE_ACCESS[role].canManageTasks,
);

const CUSTOMER_CREATION_DENIED_ROLES = USER_ROLE_VALUES.filter(
  role => !ROLE_ACCESS[role].canManageCustomers,
);

const expectVisibility = async (isVisible: boolean, locator: Locator) => {
  if (isVisible) {
    await expect(locator).toBeVisible();

    return;
  }

  await expect(locator).toHaveCount(0);
};

const expectEnabled = async (isEnabled: boolean, locator: Locator) => {
  await expect(locator).toBeVisible();

  if (isEnabled) {
    await expect(locator).toBeEnabled();

    return;
  }

  await expect(locator).toBeDisabled();
};

for (const role of USER_ROLE_VALUES) {
  const access = ROLE_ACCESS[role];

  test.describe(`${role} access`, () => {
    test.use({ storageState: getAuthStatePath(role) });

    test("board shows project creation only when allowed", async ({ page }) => {
      const boardPage = createBoardPage(page);

      await boardPage.goto();

      await expect(boardPage.searchBox).toBeVisible();
      await expectVisibility(access.canCreateProject, boardPage.newProjectButton);
    });

    test("the new-project route opens the form only when allowed", async ({ page }) => {
      const formPage = createProjectFormPage(page);

      await formPage.goto();

      await expectVisibility(access.canCreateProject, formPage.createButton);
      await expectVisibility(!access.canCreateProject, formPage.createDenied);
    });

    test("the edit-project route opens the form only when allowed", async ({ page, api }) => {
      const project = await seedStandaloneProject(api, await seedCustomer(api));
      const formPage = createProjectFormPage(page);

      await formPage.gotoEdit(project.id);

      await expectVisibility(access.canEditProject, formPage.saveButton);
      await expectVisibility(!access.canEditProject, formPage.editDenied);
    });

    test("the board status control is enabled only when allowed", async ({ page, api }) => {
      const project = await seedStandaloneProject(api, await seedCustomer(api));
      const boardPage = createBoardPage(page);

      await boardPage.goto();
      await boardPage.searchBox.fill(project.name);

      await expectEnabled(access.canMoveProjectStage, boardPage.statusPicker(project.name));
    });

    test("customers page shows customer creation only when allowed", async ({ page }) => {
      const customersPage = createCustomersPage(page);

      await customersPage.goto();

      await expect(customersPage.heading).toBeVisible();
      await expectVisibility(access.canManageCustomers, customersPage.newCustomerButton);
      await expectVisibility(!access.canManageCustomers, customersPage.managersOnlyCaption);
    });

    test("task creation belongs on the board with the existing role permission", async ({
      page,
    }) => {
      const boardPage = createBoardPage(page);
      const tasksPage = createTasksPage(page);

      await boardPage.goto();

      await expectEnabled(access.canManageTasks, boardPage.newTaskButton);
      await tasksPage.goto();

      await expect(tasksPage.searchBox).toBeVisible();
      await expect(tasksPage.newTaskButton).toHaveCount(0);
      await expect(page.getByText(TASKS_COPY.REMOVED_MANAGERS_NOTE)).toHaveCount(0);
    });

    test("employees page shows the add-employee form only when allowed", async ({ page }) => {
      await page.goto(ROUTES.EMPLOYEES);

      await expect(page.getByPlaceholder(EMPLOYEES_COPY.SEARCH_PLACEHOLDER)).toBeVisible();
      await expectVisibility(
        access.canManageUsers,
        page.getByRole("button", { name: EMPLOYEES_COPY.ADD_EMPLOYEE }),
      );
    });

    test("an open task page offers claim, status and urgency controls only when allowed", async ({
      page,
      api,
    }) => {
      const { task } = await seedTaskScenario(api);
      const taskPage = createTaskPage(page);

      await taskPage.goto(task.id);

      await expect(page.getByRole("heading", { name: task.title })).toBeVisible();
      await expectVisibility(access.canClaimTasks, taskPage.claimButton);
      await expectVisibility(access.canManageTasks, taskPage.markUrgentButton);
      await expectEnabled(
        access.canChangeTaskStatus,
        taskPage.statusTab(TASK_STATUS_NAMES.IN_PROGRESS),
      );
    });

    test("my tasks list enables the status control only when allowed", async ({
      page,
      api,
      apiAs,
    }) => {
      const { task } = await seedTaskScenario(api);
      const roleApi = await apiAs(TEST_USERS[role]);
      const tasksPage = createTasksPage(page);

      await assignTaskBypassingApi(task.id, roleApi.session.user.id);
      await tasksPage.goto();
      await tasksPage.searchBox.fill(task.title);

      await expectEnabled(access.canChangeTaskStatus, tasksPage.statusPicker(task.title));
    });
  });
}

for (const role of TASK_MANAGEMENT_DENIED_ROLES) {
  test.describe(`${role} opening the new-task form`, () => {
    test.use({ storageState: getAuthStatePath(role) });

    test("sees a permission denial", async ({ page }) => {
      await page.goto(ROUTES.NEW_TASK);

      await expect(page.getByText(TASKS_COPY.CREATE_DENIED)).toBeVisible();
    });
  });
}

for (const role of CUSTOMER_CREATION_DENIED_ROLES) {
  test.describe(`${role} opening the new-customer form`, () => {
    test.use({ storageState: getAuthStatePath(role) });

    test("sees a permission denial that leads back to the customers list", async ({ page }) => {
      const formPage = createCustomerFormPage(page);

      await formPage.goto();

      await expect(formPage.deniedTitle).toBeVisible();
      await expect(formPage.saveButton).toHaveCount(0);

      await formPage.backToCustomersButton.click();

      await expect(page).toHaveURL(ROUTES.CUSTOMERS);
    });
  });
}
