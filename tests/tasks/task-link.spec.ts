import {
  seedTask,
  seedCustomer,
  linkToProject,
  seedStandaloneProject,
  seedLegacyCustomerTask,
  buildStandaloneProjectInput,
} from "../../src/api/seed-data.ts";

import { ROUTES } from "../../src/constants/routes.constant.ts";
import { TIME_UNITS } from "../../src/constants/time.constant.ts";
import { test, expect } from "../../src/fixtures/test.fixture.ts";
import { HTTP_STATUS } from "../../src/constants/http.constant.ts";
import { TASK_TYPES } from "../../src/constants/domain.constant.ts";
import { createProjectPage } from "../../src/pages/project.page.ts";
import { VIEWPORTS } from "../../src/constants/viewport.constant.ts";
import { failApiRequests } from "../../src/mocks/api-request.mock.ts";
import { USER_ROLES } from "../../src/constants/user-role.constant.ts";
import { TEST_USERS } from "../../src/constants/test-users.constant.ts";
import { TASK_LINK_KINDS } from "../../src/constants/domain.constant.ts";
import { createUniqueName } from "../../src/utilities/test-data.utility.ts";
import { getAuthStatePath } from "../../src/utilities/auth-state.utility.ts";
import { isTaskCreationRequest } from "../../src/utilities/response.utility.ts";
import { TASK_FORM_COPY, TASK_LINK_KIND_COPY } from "../../src/constants/copy.constant.ts";
import { createTaskFormPage, createTaskPage, createTasksPage } from "../../src/pages/tasks.page.ts";

const PROJECT = TASK_LINK_KINDS.PROJECT;
const TYPE_HELP =
  "משימות הצעת מחיר ותכנון נוצרות אוטומטית עם הפרויקט. כאן אפשר להוסיף משימה כללית.";

test("manual task form starts project-only with readonly General inside assignment and optional empty date", async ({
  page,
}) => {
  const form = createTaskFormPage(page);
  await form.goto();
  await expect(form.linkSearch(PROJECT)).toBeVisible();
  await expect(form.linkKindGroup).toHaveCount(0);
  await expect(form.linkSearch(TASK_LINK_KINDS.CUSTOMER)).toHaveCount(0);
  await expect(form.form.getByText(TYPE_HELP)).toBeVisible();
  await expect(form.form.getByText("כללי", { exact: true })).toBeVisible();
  await expect(form.form.getByRole("radio", { name: /הצעת מחיר|תכנון/ })).toHaveCount(0);
  await expect(form.form.locator('input[type="date"]')).toHaveValue("");
  await form.saveButton.click();
  await expect(page).toHaveURL(ROUTES.NEW_TASK);
  await expect(form.form.getByText("בחר פרויקט", { exact: true })).toBeVisible();
});

test("creating a General project task without due date sends no customer or invented date and shows type/context", async ({
  page,
  api,
}) => {
  const customer = await seedCustomer(api);
  const project = await seedStandaloneProject(api, customer);
  const form = createTaskFormPage(page);
  const title = createUniqueName("תיאום אתר");
  await form.goto();
  await form.chooseLink({ kind: PROJECT, name: project.name });
  await expect(form.form.getByText(customer.name, { exact: false })).toBeVisible();
  await form.form.getByPlaceholder(TASK_FORM_COPY.TITLE_PLACEHOLDER).fill(title);
  await form.form.getByPlaceholder(TASK_FORM_COPY.DESCRIPTION_PLACEHOLDER).fill("תיאום ביקור באתר");
  const creation = page.waitForRequest(isTaskCreationRequest);
  await form.saveButton.click();
  const payload: unknown = (await creation).postDataJSON();
  expect(payload).toMatchObject({
    projectId: project.id,
    taskType: TASK_TYPES.GENERAL,
    dueDate: null,
  });
  expect(payload).not.toHaveProperty("customerId");
  await expect(page).toHaveURL(/\/tasks\/[a-f0-9-]+$/);
  await expect(page.locator('input[type="date"]')).toHaveValue("");
  await expect(page.getByText("כללי", { exact: true }).first()).toBeVisible();
  await expect(createTaskPage(page).projectCustomerLink).toHaveText(customer.name);
});

test("project entry point retains selected project and exposes both automatic tasks immediately", async ({
  page,
  api,
}) => {
  const project = await seedStandaloneProject(api, await seedCustomer(api));
  const projectPage = createProjectPage(page);
  await projectPage.goto(project.id);
  await expect(page.getByText(`הצעת מחיר — ${project.name}`, { exact: true })).toBeVisible();
  await expect(page.getByText(`תכנון — ${project.name}`, { exact: true })).toBeVisible();
  await expect(page.getByText("טיוטה", { exact: true }).first()).toBeVisible();
  await projectPage.newTaskButton.click();
  const form = createTaskFormPage(page);
  await expect(form.replaceLinkButton(PROJECT)).toBeVisible();
  await expect(form.form.getByText(project.name, { exact: true })).toBeVisible();
  await expect(form.form.getByText(TYPE_HELP)).toBeVisible();
});

test("selected project request error keeps context, blocks save and retries successfully", async ({
  page,
  api,
}) => {
  const project = await seedStandaloneProject(api, await seedCustomer(api));
  const failure = await failApiRequests(page, `/project/${project.id}`);
  await page.goto(`${ROUTES.NEW_TASK}?projectId=${project.id}`);
  const form = createTaskFormPage(page);
  await expect(form.form.getByText(TASK_LINK_KIND_COPY.PROJECT.SELECTED_ERROR)).toBeVisible();
  await expect(form.saveButton).toBeDisabled();
  await failure.release();
  await form.form.getByRole("button", { name: "נסה שוב" }).click();
  await expect(form.form.getByText(project.name, { exact: true })).toBeVisible();
  await expect(form.saveButton).toBeEnabled();
});

test("cached selected project refetch error is visible and retry restores selection", async ({
  page,
  api,
}) => {
  await page.clock.install();
  const project = await seedStandaloneProject(api, await seedCustomer(api));
  await createProjectPage(page).goto(project.id);
  await expect(createProjectPage(page).newTaskButton).toBeVisible();
  await page.clock.fastForward(TIME_UNITS.MINUTE_MS + 1);
  await page.clock.resume();
  const failure = await failApiRequests(page, `/project/${project.id}`);
  const refetch = page.waitForResponse(
    response =>
      new URL(response.url()).pathname === `/api/project/${project.id}` &&
      response.status() === HTTP_STATUS.INTERNAL_SERVER_ERROR,
  );
  await createProjectPage(page).newTaskButton.click();
  await refetch;
  const form = createTaskFormPage(page);
  await expect(form.form.getByText(TASK_LINK_KIND_COPY.PROJECT.SELECTED_ERROR)).toBeVisible();
  await expect(form.saveButton).toBeDisabled();
  await failure.release();
  await form.form.getByRole("button", { name: "נסה שוב" }).click();
  await expect(form.form.getByText(project.name, { exact: true })).toBeVisible();
  await expect(form.saveButton).toBeEnabled();
});

test("empty project search offers explicit create project navigation", async ({ page }) => {
  const form = createTaskFormPage(page);
  await form.goto();
  await form.linkSearch(PROJECT).fill(createUniqueName("איןפרויקט"));
  await expect(form.form.getByText(TASK_LINK_KIND_COPY.PROJECT.EMPTY)).toBeVisible();
  const createProject = form.form.getByRole("link", { name: "צור פרויקט חדש" });
  await expect(createProject).toHaveAttribute("href", ROUTES.NEW_PROJECT);
  await expect(createProject).toHaveAttribute("target", "_blank");
});

test("protected task details expose readonly type/resume help and allow optional date clearing", async ({
  page,
  api,
}) => {
  const project = await seedStandaloneProject(api, await seedCustomer(api));
  const body = await api.getProjectTasks(project.id);
  const task = body.items.find(entry => entry.taskType === TASK_TYPES.QUOTATION);
  if (!task) {
    throw new Error("Mandatory quotation task is missing");
  }
  await createTaskPage(page).goto(task.id);
  await expect(
    page.getByText("משימת פרויקט קבועה — לעבודה נוספת מחזירים את אותה משימה לבעבודה."),
  ).toBeVisible();
  await expect(page.getByText("הצעת מחיר", { exact: true }).first()).toBeVisible();
  await expect(page.getByRole("button", { name: /מחק/ })).toHaveCount(0);
  const date = page.locator('input[type="date"]');
  await expect(date).toHaveValue("");
  await date.fill("2030-02-20");
  await expect.poll(async () => (await api.getTask(task.id)).dueDate).toContain("2030-02-20");
  await date.clear();
  await expect.poll(async () => (await api.getTask(task.id)).dueDate).toBeNull();
});

test("Settings exposes five fixed project statuses including Draft with no editing controls", async ({
  page,
}) => {
  await page.goto(ROUTES.SETTINGS);
  for (const label of ["טיוטה", "ממתין", "בעבודה", "להמתין", "הסתיים"]) {
    await expect(page.getByText(label, { exact: true }).first()).toBeVisible();
  }
  await expect(page.getByRole("button", { name: /הוסף סטטוס|מחק סטטוס/ })).toHaveCount(0);
});

test.describe("personal tasks preserve legacy metadata and type badges", () => {
  test.use({ storageState: getAuthStatePath(USER_ROLES.ENGINEER) });
  for (const viewport of [{ width: 1440, height: 1000 }, VIEWPORTS.MOBILE]) {
    test(`project and legacy customer tasks render on ${viewport.width}px`, async ({
      page,
      api,
      apiAs,
    }) => {
      await page.setViewportSize(viewport);
      const engineer = await apiAs(TEST_USERS[USER_ROLES.ENGINEER]);
      const customer = await seedCustomer(api);
      const project = await seedStandaloneProject(api, customer);
      const task = await seedTask(api, {
        link: linkToProject(project),
        assigneeId: engineer.session.user.id,
      });
      const legacy = await seedLegacyCustomerTask(api, customer, engineer.session.user.id);
      const tasks = createTasksPage(page);
      await tasks.goto();
      await tasks.searchBox.fill(customer.name);
      for (const title of [task.title, legacy.title]) {
        await expect(page.getByText(title, { exact: true })).toBeVisible();
      }
      await expect(page.getByText("כללי", { exact: true }).first()).toBeVisible();
      await expect(tasks.newTaskButton).toHaveCount(0);
      await expect(page.getByText(project.name, { exact: true })).toBeVisible();
    });
  }
});

test("maximum project title retains full automatic title and wraps on mobile", async ({
  page,
  api,
}, testInfo) => {
  const input = await buildStandaloneProjectInput(api, await seedCustomer(api));
  const project = await api.createProject({ ...input, name: "א".repeat(200) });
  await page.setViewportSize(VIEWPORTS.MOBILE);
  await createProjectPage(page).goto(project.id);
  await expect(page.getByText(`הצעת מחיר — ${project.name}`, { exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  await page.screenshot({ path: testInfo.outputPath("mobile-long-title.png"), fullPage: true });
});

for (const viewport of [{ width: 1440, height: 1000 }, VIEWPORTS.MOBILE]) {
  test(`task design evidence at ${viewport.width}px`, async ({ page, api }, testInfo) => {
    await page.setViewportSize(viewport);
    const project = await seedStandaloneProject(api, await seedCustomer(api));
    const tasks = await api.getProjectTasks(project.id);
    await createProjectPage(page).goto(project.id);
    await expect(page.getByText(`הצעת מחיר — ${project.name}`, { exact: true })).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath("project.png"), fullPage: true });
    await createProjectPage(page).newTaskButton.click();
    await expect(page.getByText(TYPE_HELP)).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath("new-task.png"), fullPage: true });
    await createTaskPage(page).goto(tasks.items[0].id);
    await expect(
      page.getByText("משימת פרויקט קבועה — לעבודה נוספת מחזירים את אותה משימה לבעבודה."),
    ).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath("task.png"), fullPage: true });
    await page.goto(ROUTES.SETTINGS);
    await expect(page.getByText("טיוטה", { exact: true }).first()).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath("settings.png"), fullPage: true });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
  });
}
