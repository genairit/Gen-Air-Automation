import {
  seedTask,
  seedBuilding,
  seedCustomer,
  linkToProject,
  linkToCustomer,
  seedLegacyApartment,
  OWNED_PROJECT_SEEDERS,
  seedStandaloneProject,
  seedLegacyTaskScenario,
} from "../../src/api/seed-data.ts";

import {
  createTaskPage,
  createTasksPage,
  createTaskFormPage,
  findTaskLinkCaption,
  type ITaskLinkChoice,
  buildLinkedToTilePattern,
} from "../../src/pages/tasks.page.ts";

import {
  formatClearedLinkNotice,
  formatProjectCustomerNote,
  formatProjectCustomerContext,
} from "../../src/utilities/copy.utility.ts";

import {
  failApiRequests,
  holdApiRequests,
  holdThenFailApiRequests,
} from "../../src/mocks/api-request.mock.ts";

import {
  buildTaskRoute,
  buildProjectRoute,
  buildCustomerRoute,
  readLastPathSegment,
} from "../../src/utilities/route.utility.ts";

import {
  TASK_COPY,
  TASK_LINK_COPY,
  TASK_LINK_KIND_COPY,
} from "../../src/constants/copy.constant.ts";

import type { Page } from "@playwright/test";
import type { TGenAirApi } from "../../src/api/gen-air-api.ts";
import { ROUTES } from "../../src/constants/routes.constant.ts";
import { API_PATHS } from "../../src/constants/api.constant.ts";
import { test, expect } from "../../src/fixtures/test.fixture.ts";
import { createProjectPage } from "../../src/pages/project.page.ts";
import { formatFullName } from "../../src/utilities/user.utility.ts";
import { VIEWPORTS } from "../../src/constants/viewport.constant.ts";
import { findMainContent } from "../../src/pages/layout.component.ts";
import { USER_ROLES } from "../../src/constants/user-role.constant.ts";
import { TEST_USERS } from "../../src/constants/test-users.constant.ts";
import { KEYBOARD_KEYS } from "../../src/constants/keyboard.constant.ts";
import { expectResultRowCount } from "../../src/pages/table.component.ts";
import { createUniqueName } from "../../src/utilities/test-data.utility.ts";
import { getAuthStatePath } from "../../src/utilities/auth-state.utility.ts";
import { isTaskCreationRequest } from "../../src/utilities/response.utility.ts";
import { ROUTE_PATTERNS } from "../../src/constants/route-patterns.constant.ts";
import { buildProjectPath, buildCustomerPath } from "../../src/utilities/api-path.utility.ts";
import { TASK_LINK_KINDS, type TaskLinkKindType } from "../../src/constants/domain.constant.ts";

const ENGINEER = TEST_USERS[USER_ROLES.ENGINEER];

const TASK_DETAILS = {
  dueDate: "2030-02-20",
  description: "לתאם ביקור באתר",
  assigneeName: formatFullName(ENGINEER),
} as const;

const TITLE_PREFIX = "משימה עם שיוך";

const MISSING_SEARCH_PREFIX = "אין כזה";

const LEGACY_DESCRIPTION_PREFIX = "תיאור משימה ישנה";

const LIST_PATHS: Record<TaskLinkKindType, string> = {
  [TASK_LINK_KINDS.CUSTOMER]: API_PATHS.CUSTOMER,
  [TASK_LINK_KINDS.PROJECT]: API_PATHS.PROJECT,
};

interface ILinkTarget {
  name: string;
  detailPath: string;
}

const LINK_TARGET_SEEDERS: Record<TaskLinkKindType, (api: TGenAirApi) => Promise<ILinkTarget>> = {
  [TASK_LINK_KINDS.CUSTOMER]: async api => {
    const customer = await seedCustomer(api);

    return { name: customer.name, detailPath: buildCustomerPath(customer.id) };
  },
  [TASK_LINK_KINDS.PROJECT]: async api => {
    const project = await seedStandaloneProject(api, await seedCustomer(api));

    return { name: project.name, detailPath: buildProjectPath(project.id) };
  },
};

const buildTaskDetails = () => ({ ...TASK_DETAILS, title: createUniqueName(TITLE_PREFIX) });

const saveAndReadPayload = async (page: Page) => {
  const formPage = createTaskFormPage(page);
  const creation = page.waitForRequest(isTaskCreationRequest);

  await formPage.saveButton.click();

  const payload: unknown = (await creation).postDataJSON();

  await expect(page).toHaveURL(ROUTE_PATTERNS.TASK);

  return { payload, taskId: readLastPathSegment(page.url()) };
};

const seedLinkedTasksForEngineer = async (api: TGenAirApi, engineerId: string) => {
  const customer = await seedCustomer(api);
  const project = await seedStandaloneProject(api, customer);
  const apartment = await seedLegacyApartment(api, await seedBuilding(api, customer));
  const assign = { assigneeId: engineerId };

  const customerTask = await seedTask(api, { ...assign, link: linkToCustomer(customer) });
  const projectTask = await seedTask(api, { ...assign, link: linkToProject(project) });
  const apartmentTask = await seedTask(api, { ...assign, link: linkToProject(apartment) });
  const context = formatProjectCustomerContext(customer.name);

  const entries = [
    { task: customerTask, caption: { kind: TASK_LINK_KINDS.CUSTOMER, name: customer.name } },
    { task: projectTask, caption: { kind: TASK_LINK_KINDS.PROJECT, name: project.name, context } },
    {
      task: apartmentTask,
      caption: { kind: TASK_LINK_KINDS.PROJECT, name: apartment.name, context },
    },
  ];

  return { customer, entries };
};

test("the new-task form asks what the task is linked to before showing a picker", async ({
  page,
}) => {
  const formPage = createTaskFormPage(page);

  await formPage.goto();

  await expect(formPage.linkKindGroup).toBeVisible();
  for (const kind of Object.values(TASK_LINK_KINDS)) {
    await expect(formPage.linkKindRadio(kind)).not.toBeChecked();
    await expect(formPage.linkSearch(kind)).toHaveCount(0);
  }
  await expect(formPage.linkPlaceholder).toBeVisible();

  await formPage.saveButton.click();

  await expect(page).toHaveURL(ROUTES.NEW_TASK);
  await expect(formPage.form.getByText(TASK_LINK_COPY.KIND_REQUIRED)).toBeVisible();

  await formPage.linkKindRadio(TASK_LINK_KINDS.CUSTOMER).click();

  await expect(formPage.linkKindRadio(TASK_LINK_KINDS.CUSTOMER)).toBeChecked();
  await expect(formPage.linkSearch(TASK_LINK_KINDS.CUSTOMER)).toBeVisible();
  await expect(formPage.linkSearch(TASK_LINK_KINDS.PROJECT)).toHaveCount(0);
  await expect(formPage.linkPlaceholder).toHaveCount(0);

  await formPage.saveButton.click();

  await expect(page).toHaveURL(ROUTES.NEW_TASK);
  await expect(
    formPage.form.getByText(TASK_LINK_KIND_COPY.CUSTOMER.REQUIRED, { exact: true }),
  ).toBeVisible();
});

test("arrow keys switch the link kind", async ({ page }) => {
  const formPage = createTaskFormPage(page);
  const customerRadio = formPage.linkKindRadio(TASK_LINK_KINDS.CUSTOMER);
  const projectRadio = formPage.linkKindRadio(TASK_LINK_KINDS.PROJECT);

  await formPage.goto();
  await customerRadio.focus();
  await page.keyboard.press(KEYBOARD_KEYS.ARROW_LEFT);

  await expect(projectRadio).toBeChecked();
  await expect(projectRadio).toBeFocused();
  await expect(formPage.linkSearch(TASK_LINK_KINDS.PROJECT)).toBeVisible();

  await page.keyboard.press(KEYBOARD_KEYS.ARROW_RIGHT);

  await expect(customerRadio).toBeChecked();
  await expect(customerRadio).toBeFocused();
  await expect(formPage.linkSearch(TASK_LINK_KINDS.CUSTOMER)).toBeVisible();
});

test("create a customer task: only the customer is sent and the task page shows it", async ({
  page,
  api,
}) => {
  const customer = await seedCustomer(api);
  const formPage = createTaskFormPage(page);
  const taskPage = createTaskPage(page);
  const link = { kind: TASK_LINK_KINDS.CUSTOMER, name: customer.name };

  await formPage.goto();
  await formPage.fill({ ...buildTaskDetails(), link });

  await expect(formPage.replaceLinkButton(TASK_LINK_KINDS.CUSTOMER)).toBeVisible();

  const { payload, taskId } = await saveAndReadPayload(page);

  expect(payload).toMatchObject({ customerId: customer.id });
  expect(payload).not.toHaveProperty("projectId");
  expect(await api.getTask(taskId)).toMatchObject({ projectId: null, customerId: customer.id });

  await expect(taskPage.linkedToTile(TASK_LINK_KINDS.CUSTOMER)).toHaveText(
    buildLinkedToTilePattern(TASK_LINK_KINDS.CUSTOMER, customer.name),
  );
  await expect(taskPage.linkedTo(TASK_LINK_KINDS.CUSTOMER)).toHaveText(customer.name);
  await expect(taskPage.linkedTo(TASK_LINK_KINDS.CUSTOMER)).toHaveAttribute(
    "href",
    buildCustomerRoute(customer.id),
  );
  await expect(page.getByText(TASK_COPY.PROJECT_CUSTOMER, { exact: true })).toHaveCount(0);
});

test("create a project task: its customer is information only and is not sent", async ({
  page,
  api,
}) => {
  const customer = await seedCustomer(api);
  const project = await seedStandaloneProject(api, customer);
  const formPage = createTaskFormPage(page);
  const taskPage = createTaskPage(page);
  const link = { kind: TASK_LINK_KINDS.PROJECT, name: project.name };

  await formPage.goto();
  await formPage.fill({ ...buildTaskDetails(), link });

  await expect(formPage.form.getByText(formatProjectCustomerNote(customer.name))).toBeVisible();
  await expect(formPage.form.getByText(TASK_LINK_COPY.INFO_ONLY, { exact: true })).toBeVisible();

  const { payload, taskId } = await saveAndReadPayload(page);

  expect(payload).toMatchObject({ projectId: project.id });
  expect(payload).not.toHaveProperty("customerId");
  expect(await api.getTask(taskId)).toMatchObject({ customerId: null, projectId: project.id });

  await expect(taskPage.linkedToTile(TASK_LINK_KINDS.PROJECT)).toHaveText(
    buildLinkedToTilePattern(TASK_LINK_KINDS.PROJECT, project.name),
  );
  await expect(taskPage.linkedTo(TASK_LINK_KINDS.PROJECT)).toHaveText(project.name);
  await expect(taskPage.linkedTo(TASK_LINK_KINDS.PROJECT)).toHaveAttribute(
    "href",
    buildProjectRoute(project.id),
  );
  await expect(taskPage.projectCustomerLink).toHaveText(customer.name);
  await expect(taskPage.projectCustomerLink).toHaveAttribute(
    "href",
    buildCustomerRoute(customer.id),
  );
});

test("switching the link kind clears the earlier choice with undo and dismiss", async ({
  page,
  api,
}) => {
  const customer = await seedCustomer(api);
  const formPage = createTaskFormPage(page);
  const customerLink: ITaskLinkChoice = { kind: TASK_LINK_KINDS.CUSTOMER, name: customer.name };
  const clearedNotice = formPage.notice(
    formatClearedLinkNotice(TASK_LINK_KINDS.CUSTOMER, customer.name),
  );

  await formPage.goto();
  await formPage.chooseLink(customerLink);
  await formPage.linkKindRadio(TASK_LINK_KINDS.PROJECT).click();

  await expect(clearedNotice).toBeVisible();
  await expect(formPage.linkSearch(TASK_LINK_KINDS.PROJECT)).toHaveValue("");
  await expect(formPage.replaceLinkButton(TASK_LINK_KINDS.CUSTOMER)).toHaveCount(0);

  await formPage.dismissButton.click();

  await expect(clearedNotice).toHaveCount(0);
  await expect(formPage.linkKindRadio(TASK_LINK_KINDS.PROJECT)).toBeChecked();

  await formPage.linkKindRadio(TASK_LINK_KINDS.CUSTOMER).click();

  await expect(formPage.undoButton).toHaveCount(0);
  await expect(formPage.linkSearch(TASK_LINK_KINDS.CUSTOMER)).toBeVisible();

  await formPage.chooseLink(customerLink);
  await formPage.linkKindRadio(TASK_LINK_KINDS.PROJECT).click();
  await formPage.undoButton.click();

  await expect(clearedNotice).toHaveCount(0);
  await expect(formPage.linkKindRadio(TASK_LINK_KINDS.CUSTOMER)).toBeChecked();
  await expect(formPage.replaceLinkButton(TASK_LINK_KINDS.CUSTOMER)).toBeVisible();
  await expect(formPage.form.getByText(customer.name, { exact: true })).toBeVisible();

  await formPage.fillDetails(buildTaskDetails());

  const { payload } = await saveAndReadPayload(page);

  expect(payload).toMatchObject({ customerId: customer.id });
  expect(payload).not.toHaveProperty("projectId");
});

test("switching from a project to a customer sends only the customer", async ({ page, api }) => {
  const customer = await seedCustomer(api);
  const project = await seedStandaloneProject(api, await seedCustomer(api));
  const formPage = createTaskFormPage(page);
  const clearedNotice = formPage.notice(
    formatClearedLinkNotice(TASK_LINK_KINDS.PROJECT, project.name),
  );

  await formPage.goto();
  await formPage.chooseLink({ kind: TASK_LINK_KINDS.PROJECT, name: project.name });

  await expect(formPage.replaceLinkButton(TASK_LINK_KINDS.PROJECT)).toBeVisible();

  await formPage.linkKindRadio(TASK_LINK_KINDS.CUSTOMER).click();

  await expect(clearedNotice).toBeVisible();
  await expect(formPage.linkSearch(TASK_LINK_KINDS.PROJECT)).toHaveCount(0);

  await formPage.chooseLink({ kind: TASK_LINK_KINDS.CUSTOMER, name: customer.name });

  await expect(clearedNotice).toHaveCount(0);

  await formPage.fillDetails(buildTaskDetails());

  const { payload, taskId } = await saveAndReadPayload(page);

  expect(payload).toMatchObject({ customerId: customer.id });
  expect(payload).not.toHaveProperty("projectId");
  expect(await api.getTask(taskId)).toMatchObject({ projectId: null, customerId: customer.id });
});

for (const kind of Object.values(TASK_LINK_KINDS)) {
  test(`the selected ${kind.toLowerCase()} shows loading, then an error with retry`, async ({
    page,
    api,
  }) => {
    const formPage = createTaskFormPage(page);
    const copy = TASK_LINK_KIND_COPY[kind];
    const linkTarget = await LINK_TARGET_SEEDERS[kind](api);
    const detailRequests = await holdThenFailApiRequests(page, linkTarget.detailPath);

    await formPage.goto();
    await formPage.chooseLink({ kind, name: linkTarget.name });

    await expect(formPage.form.getByText(copy.SELECTED_LOADING)).toBeVisible();

    await detailRequests.fail();

    await expect(formPage.form.getByText(copy.SELECTED_ERROR)).toBeVisible();
    await expect(formPage.replaceLinkButton(kind)).toBeVisible();

    await detailRequests.restore();
    await formPage.form.getByRole("button", { name: TASK_LINK_COPY.RETRY }).click();

    await expect(formPage.form.getByText(copy.SELECTED_ERROR)).toHaveCount(0);
    await expect(formPage.form.getByText(linkTarget.name, { exact: true })).toBeVisible();
    await expect(formPage.replaceLinkButton(kind)).toBeVisible();
  });

  test(`the ${kind.toLowerCase()} picker shows loading, error with retry and empty results`, async ({
    page,
  }) => {
    const formPage = createTaskFormPage(page);
    const copy = TASK_LINK_KIND_COPY[kind];
    const pendingList = await holdApiRequests(page, LIST_PATHS[kind]);

    await formPage.goto();
    await formPage.linkKindRadio(kind).click();

    await expect(formPage.linkResults(kind).getByText(copy.LOADING)).toBeVisible();

    await pendingList.release();

    await expect(formPage.linkResults(kind).getByText(copy.LOADING)).toHaveCount(0);

    const failingList = await failApiRequests(page, LIST_PATHS[kind]);

    await formPage.linkSearch(kind).fill(createUniqueName(MISSING_SEARCH_PREFIX));

    await expect(formPage.linkResults(kind).getByText(copy.ERROR)).toBeVisible();

    await failingList.release();
    await formPage.linkResults(kind).getByRole("button", { name: TASK_LINK_COPY.RETRY }).click();

    await expect(formPage.linkResults(kind).getByText(copy.EMPTY)).toBeVisible();
    await expect(formPage.linkResults(kind).getByText(copy.ERROR)).toHaveCount(0);
  });
}

test("a customer search with no matches offers to create a new customer", async ({ page }) => {
  const formPage = createTaskFormPage(page);

  await formPage.goto();
  await formPage.linkKindRadio(TASK_LINK_KINDS.CUSTOMER).click();
  await formPage.linkSearch(TASK_LINK_KINDS.CUSTOMER).fill(createUniqueName(MISSING_SEARCH_PREFIX));

  await expect(formPage.form.getByText(TASK_LINK_KIND_COPY.CUSTOMER.EMPTY)).toBeVisible();

  await formPage.form.getByRole("button", { name: TASK_LINK_COPY.NEW_CUSTOMER }).click();

  await expect(page).toHaveURL(ROUTES.NEW_CUSTOMER);
});

test("a new task opened from a project starts linked to that project", async ({ page, api }) => {
  const customer = await seedCustomer(api);
  const project = await seedStandaloneProject(api, customer);
  const projectPage = createProjectPage(page);
  const formPage = createTaskFormPage(page);
  const taskPage = createTaskPage(page);

  await projectPage.goto(project.id);
  await projectPage.newTaskButton.click();

  await expect(formPage.linkKindRadio(TASK_LINK_KINDS.PROJECT)).toBeChecked();
  await expect(formPage.replaceLinkButton(TASK_LINK_KINDS.PROJECT)).toBeVisible();
  await expect(formPage.form.getByText(project.name, { exact: true })).toBeVisible();
  await expect(formPage.form.getByText(formatProjectCustomerNote(customer.name))).toBeVisible();

  await formPage.fillDetails(buildTaskDetails());

  const { payload } = await saveAndReadPayload(page);

  expect(payload).toMatchObject({ projectId: project.id });
  expect(payload).not.toHaveProperty("customerId");
  await expect(taskPage.linkedTo(TASK_LINK_KINDS.PROJECT)).toHaveText(project.name);
});

test("an apartment task page shows the building's customer as information only", async ({
  page,
  api,
}) => {
  const customer = await seedCustomer(api);
  const apartment = await seedLegacyApartment(api, await seedBuilding(api, customer));
  const task = await seedTask(api, { link: linkToProject(apartment) });
  const taskPage = createTaskPage(page);

  await page.goto(buildTaskRoute(task.id));

  await expect(taskPage.linkedTo(TASK_LINK_KINDS.PROJECT)).toHaveText(apartment.name);
  await expect(taskPage.projectCustomerLink).toHaveText(customer.name);
});

for (const [projectKind, seedProject] of Object.entries(OWNED_PROJECT_SEEDERS)) {
  test(`a legacy ${projectKind} task with both links shows as a project task of its project's customer`, async ({
    page,
    api,
  }) => {
    const { task, project, storedCustomer, projectCustomer } = await seedLegacyTaskScenario(
      api,
      seedProject,
    );
    const taskPage = createTaskPage(page);
    const description = createUniqueName(LEGACY_DESCRIPTION_PREFIX);

    await taskPage.goto(task.id);

    await expect(taskPage.linkedToTile(TASK_LINK_KINDS.PROJECT)).toHaveText(
      buildLinkedToTilePattern(TASK_LINK_KINDS.PROJECT, project.name),
    );
    await expect(taskPage.projectCustomerLink).toHaveText(projectCustomer.name);

    await taskPage.descriptionInput.fill(description);
    await taskPage.saveDescriptionButton.click();

    await expect(taskPage.descriptionInput).toHaveValue(description);
    await expect.poll(async () => (await api.getTask(task.id)).description).toBe(description);
    expect(await api.getTask(task.id)).toMatchObject({
      projectId: project.id,
      customerId: storedCustomer.id,
    });
  });
}

test.describe("as an engineer", () => {
  test.use({ storageState: getAuthStatePath(USER_ROLES.ENGINEER) });

  test("my tasks show each link kind and find project tasks by their customer", async ({
    page,
    api,
    apiAs,
  }) => {
    const engineerApi = await apiAs(ENGINEER);
    const { customer, entries } = await seedLinkedTasksForEngineer(
      api,
      engineerApi.session.user.id,
    );
    const tasksPage = createTasksPage(page);

    await tasksPage.goto();
    await tasksPage.searchBox.fill(customer.name);

    await expectResultRowCount(page, entries.length);
    for (const entry of entries) {
      await expect(
        findTaskLinkCaption(tasksPage.findRow(entry.task.title), entry.caption),
      ).toBeVisible();
    }
  });

  test.describe("on mobile", () => {
    test.use({ viewport: VIEWPORTS.MOBILE, isMobile: true, hasTouch: true });

    test("mobile task rows show each link kind and the project customer", async ({
      page,
      api,
      apiAs,
    }) => {
      const engineerApi = await apiAs(ENGINEER);
      const { customer, entries } = await seedLinkedTasksForEngineer(
        api,
        engineerApi.session.user.id,
      );
      const tasksPage = createTasksPage(page);
      const content = findMainContent(page);

      await tasksPage.goto();
      await tasksPage.searchBox.fill(customer.name);

      for (const entry of entries) {
        await expect(content.getByText(entry.task.title, { exact: true })).toBeVisible();
        await expect(findTaskLinkCaption(content, entry.caption)).toBeVisible();
      }
    });
  });
});
