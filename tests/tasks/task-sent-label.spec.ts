import {
  TASK_TYPES,
  TASK_STATUSES,
  TASK_STATUS_NAMES,
} from "../../src/constants/domain.constant.ts";

import { readdir } from "node:fs/promises";
import type { Request } from "@playwright/test";
import type { TGenAirApi } from "../../src/api/gen-air-api.ts";
import { test, expect } from "../../src/fixtures/test.fixture.ts";
import { findCardByTitle } from "../../src/pages/card.component.ts";
import { VIEWPORTS } from "../../src/constants/viewport.constant.ts";
import type { TaskType } from "../../src/constants/domain.constant.ts";
import { USER_ROLES } from "../../src/constants/user-role.constant.ts";
import { KEYBOARD_KEYS } from "../../src/constants/keyboard.constant.ts";
import { createTaskPage, createTasksPage } from "../../src/pages/tasks.page.ts";
import { HTTP_METHODS, HTTP_STATUS } from "../../src/constants/http.constant.ts";
import type { ITask, IProject } from "../../src/interfaces/entities.interface.ts";
import { expectTabSelected, readTabCount } from "../../src/pages/tab.component.ts";
import { createQuotationEmailPage } from "../../src/pages/quotation-email.page.ts";
import { AUTOMATION_DIRECTORIES } from "../../src/constants/environment.constant.ts";
import { seedUser, seedCustomer, seedStandaloneProject } from "../../src/api/seed-data.ts";

interface ISentScenario {
  project: IProject;
  tasks: (ITask & { taskType: TaskType })[];
  engineer: Awaited<ReturnType<typeof seedUser>>;
}

const OLD_LABEL = "נשלחה הצעה";
const seedSentScenario = async (api: TGenAirApi): Promise<ISentScenario> => {
  const engineer = await seedUser(api, USER_ROLES.ENGINEER);
  const project = await seedStandaloneProject(api, await seedCustomer(api));
  const tasks: ISentScenario["tasks"] = [];
  for (const taskType of [TASK_TYPES.QUOTATION, TASK_TYPES.PLANNING]) {
    tasks.push({
      taskType,
      ...(await api.createTask({
        projectId: project.id,
        taskType,
        assigneeId: engineer.id,
        title: `בדיקת סטטוס ${taskType} ${project.id}`,
        description: "בדיקת תווית סטטוס",
      })),
    });
  }
  return { engineer, tasks, project };
};
const completeTask = async (api: TGenAirApi, id: string): Promise<void> => {
  const response = await api.send(HTTP_METHODS.PATCH, `/task/${id}/status`, {
    status: TASK_STATUSES.PROPOSAL_SENT,
  });
  expect(response.status()).toBe(HTTP_STATUS.OK);
};

for (const viewport of [{ width: 1440, height: 1000 }, VIEWPORTS.MOBILE]) {
  test(`sent quotation and planning task labels persist in personal rows, filters and history at ${viewport.width}px`, async ({
    api,
    apiAs,
    openPageAs,
  }) => {
    const scenario = await seedSentScenario(api);
    const foreign = await api.createTask({
      projectId: scenario.project.id,
      title: "נשלח של עובד אחר",
      description: "לא אישי",
    });
    for (const task of [...scenario.tasks, foreign]) {
      await completeTask(api, task.id);
    }
    const actor = await apiAs(scenario.engineer);
    const before = await Promise.all(scenario.tasks.map(task => api.getTaskTransitions(task.id)));
    const mailBefore = await readdir(AUTOMATION_DIRECTORIES.MAIL);
    const page = await openPageAs(scenario.engineer);
    await page.setViewportSize(viewport);
    const mutations: string[] = [];
    page.on("request", request => {
      const isMutation = request.method() !== HTTP_METHODS.GET;
      const isTaskOrEmail = /\/api\/(task\/|quotation-execution-email\/)/.test(request.url());
      if (isMutation && isTaskOrEmail) {
        mutations.push(request.url());
      }
    });
    const list = createTasksPage(page);
    await list.goto();
    const sentFilter = list.tab(TASK_STATUS_NAMES.QUOTE_SENT);
    await expect(sentFilter).toBeVisible();
    expect(await readTabCount(sentFilter)).toBe(
      await actor.countMyTasksInStatus(TASK_STATUSES.PROPOSAL_SENT),
    );
    expect(await readTabCount(sentFilter)).toBe(scenario.tasks.length);
    const sentResponse = page.waitForResponse(response => {
      const url = new URL(response.url());
      const isPersonalList = url.pathname === "/api/task/my-tasks";
      const isSentFilter = url.searchParams.get("status") === TASK_STATUSES.PROPOSAL_SENT;
      return isPersonalList && isSentFilter;
    });
    await sentFilter.focus();
    await page.keyboard.press(KEYBOARD_KEYS.ENTER);
    expect((await sentResponse).status()).toBe(HTTP_STATUS.OK);
    for (const task of scenario.tasks) {
      const row = list
        .findRow(task.title)
        .or(page.getByRole("region", { name: task.title, exact: true }));
      await expect(row).toBeVisible();
      if (viewport === VIEWPORTS.MOBILE) {
        await expect(row.getByText(TASK_STATUS_NAMES.QUOTE_SENT, { exact: true })).toBeVisible();
      }
    }
    await expect(page.getByText(foreign.title, { exact: true })).toHaveCount(0);
    await expect(page.getByText(OLD_LABEL, { exact: true })).toHaveCount(0);
    for (const [index, task] of scenario.tasks.entries()) {
      const detail = createTaskPage(page);
      await detail.goto(task.id);
      await expectTabSelected(detail.statusTab(TASK_STATUS_NAMES.QUOTE_SENT));
      await expect(
        findCardByTitle(page, task.title).getByText(TASK_STATUS_NAMES.QUOTE_SENT, { exact: true }),
      ).toHaveCount(2);
      await expect(
        detail.history.getByText(TASK_STATUS_NAMES.QUOTE_SENT, { exact: true }),
      ).toBeVisible();
      await page.reload();
      await expectTabSelected(detail.statusTab(TASK_STATUS_NAMES.QUOTE_SENT));
      await expect(
        findCardByTitle(page, task.title).getByText(TASK_STATUS_NAMES.QUOTE_SENT, { exact: true }),
      ).toHaveCount(2);
      await expect(
        detail.history.getByText(TASK_STATUS_NAMES.QUOTE_SENT, { exact: true }),
      ).toBeVisible();
      await expect(page.getByText(OLD_LABEL, { exact: true })).toHaveCount(0);
      expect((await api.getTask(task.id)).status).toBe(TASK_STATUSES.PROPOSAL_SENT);
      expect(await api.getTaskTransitions(task.id)).toEqual(before[index]);
    }
    expect(mutations).toEqual([]);
    expect(await readdir(AUTOMATION_DIRECTORIES.MAIL)).toEqual(mailBefore);
  });
}

test("sent control sends the stable key once for each task type and cancelling optional email does not dispatch", async ({
  api,
  page,
}) => {
  const scenario = await seedSentScenario(api);
  const mailBefore = await readdir(AUTOMATION_DIRECTORIES.MAIL);
  for (const task of scenario.tasks) {
    const before = await api.getTaskTransitions(task.id);
    const detail = createTaskPage(page);
    await detail.goto(task.id);
    const requests: unknown[] = [];
    const record = (request: Request) => {
      const isPatch = request.method() === HTTP_METHODS.PATCH;
      const isStatusPath = new URL(request.url()).pathname === `/api/task/${task.id}/status`;
      if (isPatch && isStatusPath) {
        requests.push(request.postDataJSON());
      }
    };
    page.on("request", record);
    await detail.statusTab(TASK_STATUS_NAMES.QUOTE_SENT).focus();
    await page.keyboard.press(KEYBOARD_KEYS.ENTER);
    await expectTabSelected(detail.statusTab(TASK_STATUS_NAMES.QUOTE_SENT));
    if (task.taskType === TASK_TYPES.QUOTATION) {
      const email = createQuotationEmailPage(page);
      await expect(email.dialog).toHaveCount(0);
      await email.open(task.id);
      await expect(email.dialog).toBeVisible();
      await email.cancel();
    }
    await expectTabSelected(detail.statusTab(TASK_STATUS_NAMES.QUOTE_SENT));
    await expect(
      findCardByTitle(page, task.title).getByText(TASK_STATUS_NAMES.QUOTE_SENT, { exact: true }),
    ).toHaveCount(2);
    await expect
      .poll(async () => (await api.getTaskTransitions(task.id)).length)
      .toBe(before.length + 1);
    expect(requests).toEqual([{ status: TASK_STATUSES.PROPOSAL_SENT }]);
    const transitions = await api.getTaskTransitions(task.id);
    expect(
      transitions.some(transition => transition.toStatus === TASK_STATUSES.PROPOSAL_SENT),
    ).toBe(true);
    await detail.statusTab(TASK_STATUS_NAMES.QUOTE_SENT).click();
    await page.reload();
    await expect(
      detail.history.getByText(TASK_STATUS_NAMES.QUOTE_SENT, { exact: true }),
    ).toBeVisible();
    expect(await api.getTaskTransitions(task.id)).toEqual(transitions);
    expect(requests).toHaveLength(1);
    page.off("request", record);
  }
  expect(await readdir(AUTOMATION_DIRECTORIES.MAIL)).toEqual(mailBefore);
});

test("read-only account sees the sent label and history without enabled transition controls", async ({
  api,
  openPageAs,
}) => {
  const scenario = await seedSentScenario(api);
  const reader = await seedUser(api, USER_ROLES.FINANCE);
  for (const task of scenario.tasks) {
    await completeTask(api, task.id);
    const before = await api.getTaskTransitions(task.id);
    const page = await openPageAs(reader);
    const detail = createTaskPage(page);
    await detail.goto(task.id);
    await expectTabSelected(detail.statusTab(TASK_STATUS_NAMES.QUOTE_SENT));
    await expect(
      findCardByTitle(page, task.title).getByText(TASK_STATUS_NAMES.QUOTE_SENT, { exact: true }),
    ).toHaveCount(2);
    await expect(detail.statusTab(TASK_STATUS_NAMES.QUOTE_SENT)).toBeDisabled();
    await expect(detail.statusTab(TASK_STATUS_NAMES.IN_PROGRESS)).toBeDisabled();
    await expect(
      detail.history.getByText(TASK_STATUS_NAMES.QUOTE_SENT, { exact: true }),
    ).toBeVisible();
    expect(await api.getTaskTransitions(task.id)).toEqual(before);
  }
});
