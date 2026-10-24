import {
  seedTask,
  seedUser,
  seedCustomer,
  linkToProject,
  seedTaskScenario,
  seedStandaloneProject,
} from "../../src/api/seed-data.ts";

import {
  TASK_STATUSES,
  TASK_LINK_KINDS,
  TASK_STATUS_NAMES,
} from "../../src/constants/domain.constant.ts";

import type { Page, Locator } from "@playwright/test";
import { ROUTES } from "../../src/constants/routes.constant.ts";
import { createBoardPage } from "../../src/pages/board.page.ts";
import { TASK_COPY } from "../../src/constants/copy.constant.ts";
import { test, expect } from "../../src/fixtures/test.fixture.ts";
import { createProjectPage } from "../../src/pages/project.page.ts";
import { formatFullName } from "../../src/utilities/user.utility.ts";
import { TEST_USERS } from "../../src/constants/test-users.constant.ts";
import { expectSingleResultRow } from "../../src/pages/table.component.ts";
import { createUniqueName } from "../../src/utilities/test-data.utility.ts";
import { getAuthStatePath } from "../../src/utilities/auth-state.utility.ts";
import { assignTaskBypassingApi } from "../../src/environment/legacy-data.ts";
import { isTaskUpdateResponse } from "../../src/utilities/response.utility.ts";
import { ROUTE_PATTERNS } from "../../src/constants/route-patterns.constant.ts";
import { readTabCount, expectTabSelected } from "../../src/pages/tab.component.ts";
import { USER_ROLES, USER_ROLE_VALUES } from "../../src/constants/user-role.constant.ts";
import { createTaskPage, createTasksPage, createTaskFormPage } from "../../src/pages/tasks.page.ts";

const ENGINEER = TEST_USERS[USER_ROLES.ENGINEER];

const NON_ENGINEER_USERS = USER_ROLE_VALUES.filter(role => role !== USER_ROLES.ENGINEER).map(
  role => TEST_USERS[role],
);

const HISTORY_ENTRIES_AFTER_ONE_CHANGE = 2;

const NEW_TASK = {
  dueDate: "2030-01-15",
  titlePrefix: "משימה מהטופס",
  description: "להכין הצעת מחיר ללקוח",
} as const;

const UPDATED_DESCRIPTION = "תיאור מעודכן אחרי שיחה עם הלקוח";

type TPersonName = Parameters<typeof formatFullName>[0];

const expectEngineerOptionsOnly = async (
  options: Locator,
  engineer: TPersonName,
  nonEngineers: TPersonName[],
) => {
  await expect(options.filter({ hasText: formatFullName(engineer) })).toHaveCount(1);
  for (const person of nonEngineers) {
    await expect(options.filter({ hasText: formatFullName(person) })).toHaveCount(0);
  }
};

const findInMyTasks = async (page: Page, taskTitle: string) => {
  const tasksPage = createTasksPage(page);

  await tasksPage.goto();
  await tasksPage.searchBox.fill(taskTitle);

  return tasksPage.findRow(taskTitle);
};

test("create a task for an engineer and see it in their tasks and on its project", async ({
  page,
  api,
  openPageAs,
}) => {
  const customer = await seedCustomer(api);
  const project = await seedStandaloneProject(api, customer);
  const formPage = createTaskFormPage(page);
  const boardPage = createBoardPage(page);
  const projectPage = createProjectPage(page);
  const title = createUniqueName(NEW_TASK.titlePrefix);

  await boardPage.goto();
  await boardPage.newTaskButton.click();
  await formPage.fill({
    title,
    dueDate: NEW_TASK.dueDate,
    link: { kind: TASK_LINK_KINDS.PROJECT, name: project.name },
    description: NEW_TASK.description,
    assigneeName: formatFullName(ENGINEER),
  });
  await formPage.saveButton.click();

  await expect(page).toHaveURL(ROUTE_PATTERNS.TASK);
  await expect(page.getByRole("heading", { name: title })).toBeVisible();

  await projectPage.goto(project.id);

  await expect(page.getByText(title)).toBeVisible();
  await expect(await findInMyTasks(page, title)).toHaveCount(0);
  await expect(await findInMyTasks(await openPageAs(ENGINEER), title)).toBeVisible();
});

test("the task form refuses to save without the required fields", async ({ page }) => {
  const formPage = createTaskFormPage(page);

  await formPage.goto();
  await formPage.saveButton.click();

  await expect(page).toHaveURL(ROUTES.NEW_TASK);
});

test("the new-task and task-page assignee pickers list engineers only", async ({ page, api }) => {
  const engineer = await seedUser(api, USER_ROLES.ENGINEER);
  const secretary = await seedUser(api, USER_ROLES.SECRETARY);
  const nonEngineers = [secretary, ...NON_ENGINEER_USERS];
  const { task } = await seedTaskScenario(api);
  const formPage = createTaskFormPage(page);
  const taskPage = createTaskPage(page);

  await formPage.goto();

  await expectEngineerOptionsOnly(await formPage.openAssigneeOptions(), engineer, nonEngineers);

  await taskPage.goto(task.id);

  await expectEngineerOptionsOnly(await taskPage.openAssigneeOptions(), engineer, nonEngineers);
});

test("change a task status from the task page and see it in the history", async ({ page, api }) => {
  const { task } = await seedTaskScenario(api);
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

test("mark a task urgent and the engineer sees it under urgent", async ({
  page,
  api,
  apiAs,
  openPageAs,
}) => {
  const engineerApi = await apiAs(ENGINEER);
  const { task } = await seedTaskScenario(api, engineerApi.session.user.id);
  const taskPage = createTaskPage(page);

  await taskPage.goto(task.id);
  await taskPage.markUrgent();

  await expect(page.getByText(TASK_COPY.URGENT_TITLE, { exact: true })).toBeVisible();

  const engineerTasksPage = createTasksPage(await openPageAs(ENGINEER));

  await engineerTasksPage.goto();
  await engineerTasksPage.tab(TASK_COPY.URGENT_TAB).click();

  await expect(engineerTasksPage.findRow(task.title)).toBeVisible();
});

test("reassign a task to another engineer", async ({ page, api }) => {
  const firstEngineer = await seedUser(api, USER_ROLES.ENGINEER);
  const secondEngineer = await seedUser(api, USER_ROLES.ENGINEER);
  const { task } = await seedTaskScenario(api, firstEngineer.id);
  const taskPage = createTaskPage(page);

  await taskPage.goto(task.id);
  await taskPage.changeAssignee(formatFullName(secondEngineer));

  await expect(taskPage.assigneeSelect).toHaveValue(formatFullName(secondEngineer));
  await expect.poll(async () => (await api.getTask(task.id)).assigneeId).toBe(secondEngineer.id);

  await page.reload();

  await expect(taskPage.assigneeSelect).toHaveValue(formatFullName(secondEngineer));
});

test("edit a task description", async ({ page, api }) => {
  const { task } = await seedTaskScenario(api);
  const taskPage = createTaskPage(page);

  await taskPage.goto(task.id);
  await taskPage.descriptionInput.fill(UPDATED_DESCRIPTION);

  const taskUpdate = page.waitForResponse(isTaskUpdateResponse(task.id));

  await taskPage.saveDescriptionButton.click();

  expect((await taskUpdate).ok()).toBe(true);

  await page.reload();

  await expect(taskPage.descriptionInput).toHaveValue(UPDATED_DESCRIPTION);
});

test("a task that keeps a legacy installer assignee can still be edited", async ({ page, api }) => {
  const { task } = await seedTaskScenario(api);
  const legacyAssignee = await seedUser(api, USER_ROLES.INSTALLER);
  const taskPage = createTaskPage(page);

  await assignTaskBypassingApi(task.id, legacyAssignee.id);
  await taskPage.goto(task.id);
  await taskPage.descriptionInput.fill(UPDATED_DESCRIPTION);

  const taskUpdate = page.waitForResponse(isTaskUpdateResponse(task.id));

  await taskPage.saveDescriptionButton.click();

  expect((await taskUpdate).ok()).toBe(true);

  await page.reload();

  await expect(taskPage.descriptionInput).toHaveValue(UPDATED_DESCRIPTION);
  expect((await api.getTask(task.id)).assigneeId).toBe(legacyAssignee.id);
});

test.describe("as an engineer", () => {
  test.use({ storageState: getAuthStatePath(USER_ROLES.ENGINEER) });

  test("my tasks counts a new assigned task and finds it by search", async ({
    page,
    api,
    apiAs,
  }) => {
    const engineerApi = await apiAs(ENGINEER);
    const tasksPage = createTasksPage(page);
    const notStartedTab = tasksPage.tab(TASK_STATUS_NAMES.NOT_STARTED);
    const { task } = await seedTaskScenario(api, engineerApi.session.user.id);
    const notStartedCount = await engineerApi.countMyTasksInStatus(TASK_STATUSES.NOT_STARTED);

    await tasksPage.goto();

    await expect.poll(() => readTabCount(notStartedTab)).toBe(notStartedCount);

    await notStartedTab.click();
    await tasksPage.searchBox.fill(task.title);

    await expect(tasksPage.findRow(task.title)).toBeVisible();
    await expectSingleResultRow(page);
  });

  test("change a task status from my tasks list", async ({ page, api, apiAs }) => {
    const engineerApi = await apiAs(ENGINEER);
    const { task } = await seedTaskScenario(api, engineerApi.session.user.id);
    const tasksPage = createTasksPage(page);

    await tasksPage.goto();
    await tasksPage.searchBox.fill(task.title);
    await tasksPage.changeStatus(task.title, TASK_STATUS_NAMES.IN_REVIEW);
    await tasksPage.tab(TASK_STATUS_NAMES.IN_REVIEW).click();

    await expect(tasksPage.findRow(task.title)).toBeVisible();
  });

  test("claim an open-pool task and find it in my tasks", async ({ page, api }) => {
    const customer = await seedCustomer(api);
    const project = await seedStandaloneProject(api, customer);
    const task = await seedTask(api, { link: linkToProject(project) });
    const taskPage = createTaskPage(page);

    await taskPage.goto(task.id);
    await taskPage.claimButton.click();

    await expect(taskPage.claimButton).toHaveCount(0);
    await expect(await findInMyTasks(page, task.title)).toBeVisible();
  });

  test("an engineer can update status but cannot change urgency", async ({ page, api }) => {
    const { task } = await seedTaskScenario(api);
    const taskPage = createTaskPage(page);

    await taskPage.goto(task.id);
    await taskPage.statusTab(TASK_STATUS_NAMES.IN_PROGRESS).click();

    await expectTabSelected(taskPage.statusTab(TASK_STATUS_NAMES.IN_PROGRESS));
    await expect(taskPage.markUrgentButton).toHaveCount(0);
  });
});
