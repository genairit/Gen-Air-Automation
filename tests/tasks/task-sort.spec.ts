import {
  failTaskSort,
  delayTaskSort,
  monitorTaskSort,
  useSmallTaskPages,
} from "../../src/utilities/task-sort.utility.ts";

import {
  TASK_SORT_COPY,
  TASK_SORT_MODES,
  TASK_SORT_FIXTURE,
} from "../../src/constants/task-sort.constant.ts";

import { createTasksPage } from "../../src/pages/tasks.page.ts";
import { test, expect } from "../../src/fixtures/test.fixture.ts";
import { createTaskSortPage } from "../../src/pages/task-sort.page.ts";
import { seedTaskSortScenario, sortTaskRows } from "../../src/api/task-sort.api.ts";
import { TASK_STATUSES, TASK_STATUS_NAMES } from "../../src/constants/domain.constant.ts";
import { readHorizontalOverflow, isWithinViewportWidth } from "../../src/pages/layout.component.ts";

test("task sorting loads real cursor pages and retains date order across status and search filters", async ({
  api,
  openPageAs,
}) => {
  const scenario = await seedTaskSortScenario(api);
  const page = await openPageAs(scenario.engineer);
  await useSmallTaskPages(page);
  const monitor = monitorTaskSort(page);
  const view = createTaskSortPage(page, scenario.prefix);
  const tasks = createTasksPage(page);
  try {
    await view.goto();
    await expect(view.sort).toHaveText(TASK_SORT_COPY.DEFAULT);
    await view.expectAll(sortTaskRows(scenario.rows, TASK_SORT_MODES.DEFAULT));
    await expect(page.getByRole("row").filter({ hasText: scenario.rows[0].title })).toContainText(
      TASK_SORT_COPY.OVERDUE,
    );
    await view.choose(TASK_SORT_MODES.EARLIEST);
    await view.expectAll(sortTaskRows(scenario.rows, TASK_SORT_MODES.EARLIEST));
    await expect(page.getByText(TASK_SORT_COPY.NO_DUE_LAST, { exact: false })).toBeVisible();
    expect(
      monitor.requests.find(request => request.sort === TASK_SORT_MODES.EARLIEST)?.cursor,
    ).toBeNull();
    await tasks.tab(TASK_STATUS_NAMES.IN_PROGRESS).click();
    const inProgress = scenario.rows.filter(row => row.status === TASK_STATUSES.IN_PROGRESS);
    await view.expectAll(sortTaskRows(inProgress, TASK_SORT_MODES.EARLIEST));
    await expect(view.sort).toHaveText(TASK_SORT_COPY.EARLIEST);
    await view.choose(TASK_SORT_MODES.LATEST);
    await view.expectAll(sortTaskRows(inProgress, TASK_SORT_MODES.LATEST));
    await tasks.tab(TASK_SORT_COPY.ALL).click();
    await view.expectAll(sortTaskRows(scenario.rows, TASK_SORT_MODES.LATEST));
    await expect(view.sort).toHaveText(TASK_SORT_COPY.LATEST);
    const chosen = scenario.rows[0];
    await view.search.fill(chosen.title);
    await view.expectAll([chosen]);
    await expect(view.sort).toHaveText(TASK_SORT_COPY.LATEST);
    await page.getByText(chosen.title, { exact: true }).click();
    await expect(page).toHaveURL(new RegExp("/tasks/" + chosen.id + "$"));
  } finally {
    monitor.dispose();
  }
});

test("rapid due-date mode changes cannot display or append a late old-order response", async ({
  api,
  openPageAs,
}) => {
  const scenario = await seedTaskSortScenario(api);
  const page = await openPageAs(scenario.engineer);
  await useSmallTaskPages(page);
  const view = createTaskSortPage(page, scenario.prefix);
  await view.goto();
  await view.expectAll(sortTaskRows(scenario.rows, TASK_SORT_MODES.DEFAULT));
  const delayed = await delayTaskSort(page, TASK_SORT_MODES.EARLIEST);
  try {
    await view.choose(TASK_SORT_MODES.EARLIEST);
    await delayed.started;
    await expect(view.sort).toBeEnabled();
    await expect(view.titles).toHaveCount(0);
    await view.choose(TASK_SORT_MODES.LATEST);
    const latest = sortTaskRows(scenario.rows, TASK_SORT_MODES.LATEST);
    await view.expectAll(latest);
    await delayed.releaseAndWaitForApplication();
    await view.expectAll(latest);
    await expect(view.sort).toHaveText(TASK_SORT_COPY.LATEST);
  } finally {
    await delayed.dispose();
  }
});

test("mobile keyboard sorting preserves current-mode retry and resets only on remount", async ({
  api,
  openPageAs,
}) => {
  const scenario = await seedTaskSortScenario(api);
  const page = await openPageAs(scenario.engineer);
  await page.setViewportSize(TASK_SORT_FIXTURE.VIEWPORT);
  await useSmallTaskPages(page);
  const view = createTaskSortPage(page, scenario.prefix);
  await view.goto();
  await view.expectAll(sortTaskRows(scenario.rows, TASK_SORT_MODES.DEFAULT));
  const failure = await failTaskSort(page, TASK_SORT_MODES.EARLIEST);
  try {
    await view.chooseByKeyboard(TASK_SORT_MODES.EARLIEST);
    await expect(page.getByRole("alert")).toBeVisible();
    await expect(view.sort).toBeEnabled();
    await expect(view.sort).toHaveText(TASK_SORT_COPY.EARLIEST);
    failure.recover();
    await view.retry.click();
    await view.expectAll(sortTaskRows(scenario.rows, TASK_SORT_MODES.EARLIEST));
    await expect(page.getByRole("alert")).toHaveCount(0);
    await view.chooseByKeyboard(TASK_SORT_MODES.LATEST);
    await view.expectAll(sortTaskRows(scenario.rows, TASK_SORT_MODES.LATEST));
    expect(await readHorizontalOverflow(page)).toBeLessThanOrEqual(1);
    expect(await isWithinViewportWidth(page, view.sort)).toBe(true);
    expect(await isWithinViewportWidth(page, view.search)).toBe(true);
    await page.reload();
    await expect(view.sort).toHaveText(TASK_SORT_COPY.DEFAULT);
    await expect(view.search).toHaveValue("");
    await view.expectAll(sortTaskRows(scenario.rows, TASK_SORT_MODES.DEFAULT));
  } finally {
    await failure.dispose();
  }
});
