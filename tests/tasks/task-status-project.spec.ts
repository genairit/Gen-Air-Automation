import {
  TASK_TYPES,
  TASK_STATUSES,
  TASK_STATUS_NAMES,
} from "../../src/constants/domain.constant.ts";

import type { Page } from "@playwright/test";
import { createTaskPage } from "../../src/pages/tasks.page.ts";
import type { TGenAirApi } from "../../src/api/gen-air-api.ts";
import { test, expect } from "../../src/fixtures/test.fixture.ts";
import { createProjectPage } from "../../src/pages/project.page.ts";
import { expectTabSelected } from "../../src/pages/tab.component.ts";
import { seedCustomer, seedStandaloneProject } from "../../src/api/seed-data.ts";
import { HTTP_METHODS, HTTP_STATUS } from "../../src/constants/http.constant.ts";
import { holdApiRequests, holdThenFailApiRequests } from "../../src/mocks/api-request.mock.ts";
import { API_PATHS, API_PROXY_PREFIX, API_SEGMENTS } from "../../src/constants/api.constant.ts";

const STATUS_FAILURE_MESSAGE = "הפעולה נכשלה. נסה שוב בעוד רגע.";
const INITIAL_TRANSITION_COUNT = 1;
const UPDATED_TRANSITION_COUNT = 2;

const statusPath = (taskId: string) => `${API_PATHS.TASK}/${taskId}/${API_SEGMENTS.STATUS}`;

const openQuotationTaskFromProject = async (page: Page, api: TGenAirApi, title: string) => {
  const project = await seedStandaloneProject(api, await seedCustomer(api));
  const task = await api.createTask({
    projectId: project.id,
    taskType: TASK_TYPES.QUOTATION,
    title,
    description: "הכנת הצעה",
  });
  const protectedPath = `${API_PROXY_PREFIX}${API_PATHS.TASK}${API_PATHS.PROJECT}/${project.id}/${API_SEGMENTS.PROTECTED}`;
  const protectedSlots = page.waitForResponse(
    response => new URL(response.url()).pathname === protectedPath,
  );
  await createProjectPage(page).goto(project.id);
  expect((await protectedSlots).status()).toBe(HTTP_STATUS.OK);
  await page.getByText(task.title, { exact: true }).click();
  return task;
};

test("quotation task status updates after its project has loaded protected task slots", async ({
  page,
  api,
}) => {
  const task = await openQuotationTaskFromProject(page, api, "הצעת מחיר לשינוי סטטוס");

  const taskPage = createTaskPage(page);
  const pendingStatus = await holdApiRequests(page, statusPath(task.id));
  const statusRequest = page.waitForRequest(
    request =>
      new URL(request.url()).pathname === `${API_PROXY_PREFIX}${statusPath(task.id)}` &&
      request.method() === HTTP_METHODS.PATCH,
  );
  const statusResponse = page.waitForResponse(
    response =>
      new URL(response.url()).pathname === `${API_PROXY_PREFIX}${statusPath(task.id)}` &&
      response.request().method() === HTTP_METHODS.PATCH,
  );

  await taskPage.statusTab(TASK_STATUS_NAMES.IN_PROGRESS).click();
  expect((await statusRequest).postDataJSON()).toEqual({ status: TASK_STATUSES.IN_PROGRESS });
  await expectTabSelected(taskPage.statusTab(TASK_STATUS_NAMES.IN_PROGRESS));
  await pendingStatus.release();
  expect((await statusResponse).status()).toBe(HTTP_STATUS.OK);
  await expect
    .poll(async () => (await api.getTask(task.id)).status)
    .toBe(TASK_STATUSES.IN_PROGRESS);
  await expect
    .poll(async () => (await api.getTaskTransitions(task.id)).length)
    .toBe(UPDATED_TRANSITION_COUNT);

  await page.reload();
  await expectTabSelected(taskPage.statusTab(TASK_STATUS_NAMES.IN_PROGRESS));
  await expect(page.getByText(STATUS_FAILURE_MESSAGE)).toHaveCount(0);
});

test("failed status request rolls back a quotation task opened through its project", async ({
  page,
  api,
}) => {
  const task = await openQuotationTaskFromProject(page, api, "הצעת מחיר לבדיקה חוזרת");

  const taskPage = createTaskPage(page);
  const failingStatus = await holdThenFailApiRequests(page, statusPath(task.id));
  await taskPage.statusTab(TASK_STATUS_NAMES.IN_PROGRESS).click();
  await expectTabSelected(taskPage.statusTab(TASK_STATUS_NAMES.IN_PROGRESS));
  await failingStatus.fail();
  await expectTabSelected(taskPage.statusTab(TASK_STATUS_NAMES.NOT_STARTED));
  await expect(page.getByText(STATUS_FAILURE_MESSAGE)).toBeVisible();
  expect((await api.getTask(task.id)).status).toBe(TASK_STATUSES.NOT_STARTED);
  expect((await api.getTaskTransitions(task.id)).length).toBe(INITIAL_TRANSITION_COUNT);
  await failingStatus.restore();
});
