import {
  seedTask,
  seedBuilding,
  seedCustomer,
  linkToProject,
  seedStandaloneProject,
  seedLegacyCustomerTask,
  buildStandaloneProjectInput,
} from "../../src/api/seed-data.ts";

import {
  selectDueDate,
  getUpcomingDate,
  findDueDateField,
  toDateInputValue,
} from "../../src/pages/date-field.component.ts";

import { ROUTES } from "../../src/constants/routes.constant.ts";
import { test, expect } from "../../src/fixtures/test.fixture.ts";
import { selectOption } from "../../src/pages/select.component.ts";
import { createProjectPage } from "../../src/pages/project.page.ts";
import { VIEWPORTS } from "../../src/constants/viewport.constant.ts";
import { failApiRequests } from "../../src/mocks/api-request.mock.ts";
import { TASK_FORM_COPY } from "../../src/constants/copy.constant.ts";
import { USER_ROLES } from "../../src/constants/user-role.constant.ts";
import { TEST_USERS } from "../../src/constants/test-users.constant.ts";
import { buildProjectRoute } from "../../src/utilities/route.utility.ts";
import { contactSearchInput } from "../../src/pages/contact-search.page.ts";
import { getAuthStatePath } from "../../src/utilities/auth-state.utility.ts";
import { isTaskCreationRequest } from "../../src/utilities/response.utility.ts";
import { HTTP_STATUS, HTTP_METHODS } from "../../src/constants/http.constant.ts";
import { TASK_TYPES, PROJECT_STATUS_NAMES } from "../../src/constants/domain.constant.ts";
import { createUniqueEmail, createUniqueName } from "../../src/utilities/test-data.utility.ts";
import { createTaskFormPage, createTaskPage, createTasksPage } from "../../src/pages/tasks.page.ts";

test("Tasks opens directly on its table and old creation URLs redirect there", async ({
  page,
  api,
}) => {
  const project = await seedStandaloneProject(api, await seedCustomer(api));
  for (const path of [
    ROUTES.TASKS,
    ROUTES.NEW_TASK,
    `${ROUTES.NEW_TASK}?projectId=${project.id}`,
  ]) {
    await page.goto(path);
    await expect(page).toHaveURL(ROUTES.TASKS);
    await expect(createTasksPage(page).searchBox).toBeVisible();
    await expect(page.getByRole("heading", { name: "המשימות שלי" })).toHaveCount(0);
    await expect(page.getByText("המשימות שהוקצו לי", { exact: true })).toHaveCount(0);
    await expect(page.getByText("המשימות שהוקצו לך", { exact: false })).toHaveCount(0);
    await expect(createTasksPage(page).newTaskButton).toHaveCount(0);
    await expect(page.getByRole("dialog")).toHaveCount(0);
  }
});

test("creating a General project task without due date sends no customer or invented date and shows type/context", async ({
  page,
  api,
}) => {
  const customer = await seedCustomer(api);
  const project = await seedStandaloneProject(api, customer);
  const form = createTaskFormPage(page);
  const title = createUniqueName("תיאום אתר");
  await form.goto(project.id);
  await expect(form.form.getByText(project.name, { exact: true })).toBeVisible();
  await expect(form.form.getByRole("searchbox")).toHaveCount(0);
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
  const openCreated = page.getByRole("status").getByRole("link", { name: "פתיחת המשימה" });
  await expect(openCreated).toBeVisible();
  await expect(page).toHaveURL(buildProjectRoute(project.id));
  await openCreated.click();
  await expect(page.getByRole("heading", { name: title })).toBeVisible();
  await expect(page.getByText("כללי", { exact: true }).first()).toBeVisible();
  await expect(createTaskPage(page).projectCustomerLink).toHaveText(customer.name);
});

test("building creation pins the owning project and can cancel without saving", async ({
  page,
  api,
}) => {
  const building = await seedBuilding(api, await seedCustomer(api));
  const form = createTaskFormPage(page);
  await form.goto(building.id);
  await expect(form.form.getByText(building.name, { exact: true })).toBeVisible();
  await expect(form.form.getByPlaceholder(/חיפוש פרויקט/)).toHaveCount(0);
  const title = createUniqueName("משימת בניין");
  await form.title.fill(title);
  await form.form.getByRole("button", { name: "ביטול", exact: true }).click();
  await expect(form.form).toHaveCount(0);
  expect((await api.getProjectTasks(building.id)).items).toEqual([]);
  await form.open();
  await expect(form.title).toHaveValue("");
  await form.title.fill(title);
  await form.description.fill("בדיקת הבניין");
  await form.saveButton.click();
  await expect(page.getByRole("status").getByRole("link", { name: "פתיחת המשימה" })).toBeVisible();
  await expect(page).toHaveURL(buildProjectRoute(building.id));
  expect((await api.getProjectTasks(building.id)).items).toEqual([
    expect.objectContaining({ title, projectId: building.id, customerId: null }),
  ]);
});

test("project entry point retains selected project and offers explicit task types", async ({
  page,
  api,
}) => {
  const project = await seedStandaloneProject(api, await seedCustomer(api));
  const projectPage = createProjectPage(page);
  await projectPage.goto(project.id);
  await expect(page.getByText("אין משימות עדיין", { exact: true })).toBeVisible();
  await expect(
    page.getByText(PROJECT_STATUS_NAMES.NOT_STARTED, { exact: true }).first(),
  ).toBeVisible();
  await projectPage.newTaskButton.click();
  await expect(page.getByRole("menuitem", { name: /הצעת מחיר/ })).toBeVisible();
  await expect(page.getByRole("menuitem", { name: /תכנון/ })).toBeVisible();
  await page.getByRole("menuitem", { name: /כללי/ }).click();
  const form = createTaskFormPage(page);
  await expect(form.form.getByRole("button", { name: /החלף פרויקט/ })).toHaveCount(0);
  await expect(form.form.getByText(project.name, { exact: true })).toBeVisible();
  await expect(form.form.getByRole("combobox", { name: "סוג משימה" })).toHaveValue("כללי");
});

test("project card deliberately creates a quotation task and reopens the occupied slot", async ({
  page,
  api,
}) => {
  const project = await seedStandaloneProject(api, await seedCustomer(api));
  await createProjectPage(page).goto(project.id);
  const title = createUniqueName("הצעת מחיר ידנית");
  await createProjectPage(page).newTaskButton.click();
  await page.getByRole("menuitem", { name: /הצעת מחיר/ }).click();
  const form = createTaskFormPage(page);
  await expect(form.form.getByText(project.name, { exact: true })).toBeVisible();
  await expect(form.form.getByRole("combobox", { name: "סוג משימה" })).toHaveValue("הצעת מחיר");
  await form.form.getByPlaceholder(TASK_FORM_COPY.TITLE_PLACEHOLDER).fill(title);
  await form.form.getByPlaceholder(TASK_FORM_COPY.DESCRIPTION_PLACEHOLDER).fill("הכנת הצעה");
  await form.saveButton.click();
  await expect(page.getByRole("status").getByRole("link", { name: "פתיחת המשימה" })).toBeVisible();
  await expect(page).toHaveURL(buildProjectRoute(project.id));
  const [task] = (await api.getProjectTasks(project.id)).items;
  expect(task).toMatchObject({ title, taskType: TASK_TYPES.QUOTATION });

  await createProjectPage(page).goto(project.id);
  await expect(page.getByText(title, { exact: true })).toBeVisible();
  await createProjectPage(page).newTaskButton.click();
  await page.getByRole("menuitem", { name: /הצעת מחיר.*פתח משימה קיימת/ }).click();
  await expect(page).toHaveURL(new RegExp(`/tasks/${task.id}$`));
});

test("protected availability failure blocks save and retries without losing the draft", async ({
  page,
  api,
}) => {
  const project = await seedStandaloneProject(api, await seedCustomer(api));
  const failure = await failApiRequests(page, `/task/project/${project.id}/protected`);
  const form = createTaskFormPage(page);
  await form.goto(project.id);
  const title = createUniqueName("תכנון");
  await form.title.fill(title);
  await selectOption(page, form.form.getByRole("combobox", { name: "סוג משימה" }), "תכנון");
  await expect(form.saveButton).toBeDisabled();
  const retry = form.form.getByRole("button", { name: "נסה שוב" });
  await expect(retry).toBeVisible();
  await failure.release();
  await retry.click();
  await expect(form.saveButton).toBeEnabled();
  await expect(form.title).toHaveValue(title);
});

test("protected task details expose readonly type/resume help and allow optional date clearing", async ({
  page,
  api,
}) => {
  const project = await seedStandaloneProject(api, await seedCustomer(api));
  const task = await api.createTask({
    projectId: project.id,
    taskType: TASK_TYPES.QUOTATION,
    title: "הצעת מחיר",
    description: "הכנת הצעה",
  });
  await createTaskPage(page).goto(task.id);
  await expect(
    page.getByText("משימת פרויקט קבועה — לעבודה נוספת מחזירים את אותה משימה לבעבודה."),
  ).toBeVisible();
  await expect(page.getByText("הצעת מחיר", { exact: true }).first()).toBeVisible();
  await expect(page.getByRole("button", { name: /מחק/ })).toHaveCount(0);
  const detail = createTaskPage(page);
  const form = createTaskFormPage(page);
  await detail.editButton.click();
  await expect(form.form.getByRole("combobox", { name: "סוג משימה" })).toBeDisabled();
  const date = findDueDateField(page);
  const selectedDate = getUpcomingDate(14);
  await expect(date).toHaveValue("");
  await selectDueDate(page, selectedDate);
  await form.saveButton.click();
  await expect
    .poll(async () => (await api.getTask(task.id)).dueDate)
    .toContain(toDateInputValue(selectedDate));
  await detail.editButton.click();
  await date.click();
  await page.getByRole("button", { name: "נקה תאריך" }).click();
  await form.saveButton.click();
  await expect.poll(async () => (await api.getTask(task.id)).dueDate).toBeNull();
});

test("Settings exposes four fixed project statuses with no editing controls", async ({ page }) => {
  await page.goto(ROUTES.SETTINGS);
  for (const label of Object.values(PROJECT_STATUS_NAMES)) {
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
      const protectedTasks = await Promise.all(
        [TASK_TYPES.QUOTATION, TASK_TYPES.PLANNING].map(taskType =>
          api.createTask({
            projectId: project.id,
            taskType,
            title: taskType,
            description: "משימה ידנית",
          }),
        ),
      );
      for (const protectedTask of protectedTasks) {
        expect(
          (await engineer.send(HTTP_METHODS.PATCH, `/task/${protectedTask.id}/claim`)).status(),
        ).toBe(HTTP_STATUS.OK);
      }
      const tasks = createTasksPage(page);
      await tasks.goto();
      await tasks.searchBox.fill(customer.name);
      for (const title of [task.title, legacy.title]) {
        await expect(page.getByText(title, { exact: true })).toBeVisible();
      }
      await expect(page.getByText("כללי", { exact: true }).first()).toBeVisible();
      await expect(page.getByText("הצעת מחיר", { exact: true }).first()).toBeVisible();
      await expect(page.getByText("תכנון", { exact: true }).first()).toBeVisible();
      await expect(page.getByText("ללא תאריך יעד", { exact: false }).first()).toBeVisible();
      await expect(tasks.newTaskButton).toHaveCount(0);
      await expect(page.getByText(project.name, { exact: true })).toHaveCount(3);
      await expect(page.getByText(project.name, { exact: true }).first()).toBeVisible();
    });
  }
});

test("maximum project title renders an empty task card without mobile overflow", async ({
  page,
  api,
}, testInfo) => {
  const input = await buildStandaloneProjectInput(api, await seedCustomer(api));
  const project = await api.createProject({ ...input, name: "א".repeat(200) });
  const contactName = createUniqueName("איש קשר ארוך");
  const contactEmail = createUniqueEmail("very.long.contact.email.address.for.mobile.layout");
  expect(
    (
      await api.send(HTTP_METHODS.POST, "/contact-directory", {
        name: contactName,
        email: contactEmail,
      })
    ).status(),
  ).toBe(HTTP_STATUS.CREATED);
  await page.setViewportSize(VIEWPORTS.MOBILE);
  await createProjectPage(page).goto(project.id);
  await expect(page.getByText("אין משימות עדיין", { exact: true })).toBeVisible();
  await contactSearchInput(page).fill(contactName);
  await expect(page.getByText(contactEmail, { exact: false })).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
  await expect
    .poll(async () => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
    .toBe(true);
  await page.screenshot({ path: testInfo.outputPath("mobile-long-title.png"), fullPage: true });
});

for (const viewport of [{ width: 1440, height: 1000 }, VIEWPORTS.MOBILE]) {
  test(`task design evidence at ${viewport.width}px`, async ({ page, api }, testInfo) => {
    await page.setViewportSize(viewport);
    const project = await seedStandaloneProject(api, await seedCustomer(api));
    const task = await api.createTask({
      projectId: project.id,
      taskType: TASK_TYPES.QUOTATION,
      title: `הצעת מחיר — ${project.name}`,
      description: "משימה ידנית",
    });
    await createProjectPage(page).goto(project.id);
    await expect(page.getByText(`הצעת מחיר — ${project.name}`, { exact: true })).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath("project.png"), fullPage: true });
    await createProjectPage(page).newTaskButton.click();
    await page.getByRole("menuitem", { name: /כללי/ }).click();
    await expect(createTaskFormPage(page).form).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath("new-task.png"), fullPage: true });
    await createTaskPage(page).goto(task.id);
    await expect(
      page.getByText("משימת פרויקט קבועה — לעבודה נוספת מחזירים את אותה משימה לבעבודה."),
    ).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath("task.png"), fullPage: true });
    await page.goto(ROUTES.SETTINGS);
    await expect(
      page.getByText(PROJECT_STATUS_NAMES.NOT_STARTED, { exact: true }).first(),
    ).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath("settings.png"), fullPage: true });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
  });
}
