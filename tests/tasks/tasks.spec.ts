import {
  seedTask,
  seedCustomer,
  seedStandaloneProject,
  seedTaskAssignedToSession,
} from "../../src/api/seed-data.ts";

import { ROUTES } from "../../src/constants/routes.constant.ts";
import { TASK_COPY } from "../../src/constants/copy.constant.ts";
import { test, expect } from "../../src/fixtures/test.fixture.ts";
import { createProjectPage } from "../../src/pages/project.page.ts";
import { formatFullName } from "../../src/utilities/user.utility.ts";
import { USER_ROLES } from "../../src/constants/user-role.constant.ts";
import { TEST_USERS } from "../../src/constants/test-users.constant.ts";
import { expectSingleResultRow } from "../../src/pages/table.component.ts";
import { createUniqueName } from "../../src/utilities/test-data.utility.ts";
import { getAuthStatePath } from "../../src/utilities/auth-state.utility.ts";
import { isTaskUpdateResponse } from "../../src/utilities/response.utility.ts";
import { ROUTE_PATTERNS } from "../../src/constants/route-patterns.constant.ts";
import { readTabCount, expectTabSelected } from "../../src/pages/tab.component.ts";
import { TASK_STATUSES, TASK_STATUS_NAMES } from "../../src/constants/domain.constant.ts";
import { createTaskPage, createTasksPage, createTaskFormPage } from "../../src/pages/tasks.page.ts";

const ADMIN = TEST_USERS[USER_ROLES.SYSTEM_ADMIN];
const MANAGER = TEST_USERS[USER_ROLES.PROJECT_MANAGER];

const HISTORY_ENTRIES_AFTER_ONE_CHANGE = 2;

const NEW_TASK = {
  dueDate: "2030-01-15",
  titlePrefix: "משימה מהטופס",
  description: "להכין הצעת מחיר ללקוח",
} as const;

const UPDATED_DESCRIPTION = "תיאור מעודכן אחרי שיחה עם הלקוח";

test("create a task and see it in my tasks and on its project", async ({ page, api }) => {
  const customer = await seedCustomer(api);
  const project = await seedStandaloneProject(api, customer);
  const formPage = createTaskFormPage(page);
  const tasksPage = createTasksPage(page);
  const projectPage = createProjectPage(page);
  const title = createUniqueName(NEW_TASK.titlePrefix);

  await tasksPage.goto();
  await tasksPage.newTaskButton.click();
  await formPage.fill({
    title,
    dueDate: NEW_TASK.dueDate,
    projectName: project.name,
    customerName: customer.name,
    description: NEW_TASK.description,
    assigneeName: formatFullName(ADMIN),
  });
  await formPage.saveButton.click();

  await expect(page).toHaveURL(ROUTE_PATTERNS.TASK);
  await expect(page.getByRole("heading", { name: title })).toBeVisible();

  await tasksPage.goto();
  await tasksPage.searchBox.fill(title);

  await expect(tasksPage.findRow(title)).toBeVisible();

  await projectPage.goto(project.id);

  await expect(page.getByText(title)).toBeVisible();
});

test("the task form refuses to save without the required fields", async ({ page }) => {
  const formPage = createTaskFormPage(page);

  await formPage.goto();
  await formPage.saveButton.click();

  await expect(page).toHaveURL(ROUTES.NEW_TASK);
});

test("my tasks counts a new assigned task and finds it by search", async ({ page, api }) => {
  const tasksPage = createTasksPage(page);
  const notStartedTab = tasksPage.tab(TASK_STATUS_NAMES.NOT_STARTED);
  const { task } = await seedTaskAssignedToSession(api);
  const notStartedCount = await api.countMyTasksInStatus(TASK_STATUSES.NOT_STARTED);

  await tasksPage.goto();

  await expect.poll(() => readTabCount(notStartedTab)).toBe(notStartedCount);

  await notStartedTab.click();
  await tasksPage.searchBox.fill(task.title);

  await expect(tasksPage.findRow(task.title)).toBeVisible();
  await expectSingleResultRow(page);
});

test("change a task status from the task page and see it in the history", async ({ page, api }) => {
  const { task } = await seedTaskAssignedToSession(api);
  const taskPage = createTaskPage(page);
  const historyEntries = taskPage.history.getByRole("listitem");

  await taskPage.goto(task.id);
  await taskPage.statusTab(TASK_STATUS_NAMES.IN_PROGRESS).click();

  await expectTabSelected(taskPage.statusTab(TASK_STATUS_NAMES.IN_PROGRESS));
  await expect(historyEntries).toHaveCount(HISTORY_ENTRIES_AFTER_ONE_CHANGE);
  await expect(
    historyEntries.filter({ has: page.getByText(TASK_STATUS_NAMES.IN_PROGRESS, { exact: true }) }),
  ).toHaveCount(1);
});

test("change a task status from my tasks list", async ({ page, api }) => {
  const { task } = await seedTaskAssignedToSession(api);
  const tasksPage = createTasksPage(page);

  await tasksPage.goto();
  await tasksPage.searchBox.fill(task.title);
  await tasksPage.changeStatus(task.title, TASK_STATUS_NAMES.IN_REVIEW);
  await tasksPage.tab(TASK_STATUS_NAMES.IN_REVIEW).click();

  await expect(tasksPage.findRow(task.title)).toBeVisible();
});

test("mark a task urgent after confirming", async ({ page, api }) => {
  const { task } = await seedTaskAssignedToSession(api);
  const taskPage = createTaskPage(page);
  const tasksPage = createTasksPage(page);

  await taskPage.goto(task.id);
  await taskPage.markUrgent();

  await expect(page.getByText(TASK_COPY.URGENT_TITLE, { exact: true })).toBeVisible();

  await tasksPage.goto();
  await tasksPage.tab(TASK_COPY.URGENT_TAB).click();

  await expect(tasksPage.findRow(task.title)).toBeVisible();
});

test("reassign a task to another employee", async ({ page, api }) => {
  const { task } = await seedTaskAssignedToSession(api);
  const taskPage = createTaskPage(page);
  const tasksPage = createTasksPage(page);

  await taskPage.goto(task.id);
  await taskPage.changeAssignee(formatFullName(MANAGER));

  await expect(taskPage.assigneeSelect).toHaveValue(formatFullName(MANAGER));

  await tasksPage.goto();
  await tasksPage.searchBox.fill(task.title);

  await expect(tasksPage.findRow(task.title)).toHaveCount(0);
});

test("edit a task description", async ({ page, api }) => {
  const { task } = await seedTaskAssignedToSession(api);
  const taskPage = createTaskPage(page);

  await taskPage.goto(task.id);
  await taskPage.descriptionInput.fill(UPDATED_DESCRIPTION);

  const taskUpdate = page.waitForResponse(isTaskUpdateResponse(task.id));

  await taskPage.saveDescriptionButton.click();

  expect((await taskUpdate).ok()).toBe(true);

  await page.reload();

  await expect(taskPage.descriptionInput).toHaveValue(UPDATED_DESCRIPTION);
});

test.describe("as a lead installer", () => {
  test.use({ storageState: getAuthStatePath(USER_ROLES.LEAD_INSTALLER) });

  test("claim an open-pool task and find it in my tasks", async ({ page, api }) => {
    const customer = await seedCustomer(api);
    const project = await seedStandaloneProject(api, customer);
    const task = await seedTask(api, { project, customer });
    const taskPage = createTaskPage(page);
    const tasksPage = createTasksPage(page);

    await taskPage.goto(task.id);
    await taskPage.claimButton.click();

    await expect(taskPage.claimButton).toHaveCount(0);

    await tasksPage.goto();
    await tasksPage.searchBox.fill(task.title);

    await expect(tasksPage.findRow(task.title)).toBeVisible();
  });

  test("an installer can update status but cannot change urgency", async ({ page, api }) => {
    const customer = await seedCustomer(api);
    const project = await seedStandaloneProject(api, customer);
    const task = await seedTask(api, { project, customer });
    const taskPage = createTaskPage(page);

    await taskPage.goto(task.id);
    await taskPage.statusTab(TASK_STATUS_NAMES.IN_PROGRESS).click();

    await expectTabSelected(taskPage.statusTab(TASK_STATUS_NAMES.IN_PROGRESS));
    await expect(taskPage.markUrgentButton).toHaveCount(0);
  });
});
