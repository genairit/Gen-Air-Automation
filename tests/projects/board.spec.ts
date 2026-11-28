import {
  seedBuilding,
  seedCustomer,
  seedApartment,
  seedStandaloneProject,
} from "../../src/api/seed-data.ts";

import { devices } from "@playwright/test";
import { createBoardPage } from "../../src/pages/board.page.ts";
import { BOARD_COPY } from "../../src/constants/copy.constant.ts";
import { test, expect } from "../../src/fixtures/test.fixture.ts";
import { HTTP_METHODS } from "../../src/constants/http.constant.ts";
import { createProjectPage } from "../../src/pages/project.page.ts";
import { PROJECT_PAGE_COPY } from "../../src/constants/copy.constant.ts";
import { buildProjectRoute } from "../../src/utilities/route.utility.ts";
import { expectSingleResultRow } from "../../src/pages/table.component.ts";
import { buildProjectStagePath } from "../../src/utilities/api-path.utility.ts";
import { PROJECT_TYPE_NAMES, PROJECT_STATUS_NAMES } from "../../src/constants/domain.constant.ts";

const TIMELINE_ENTRIES_AFTER_ONE_CHANGE = 2;

const { defaultBrowserType: _browserType, ...PHONE } = devices["Pixel 7"];

test("the board has no manager filter and retains project type filtering", async ({
  page,
  api,
}) => {
  const boardPage = createBoardPage(page);
  const customer = await seedCustomer(api);
  const building = await seedBuilding(api, customer);
  const commercial = await seedStandaloneProject(api, customer);

  await boardPage.goto();

  await expect(page.getByText("כל המנהלים", { exact: true })).toHaveCount(0);
  await expect(boardPage.typeFilter).toBeVisible();
  await expect(boardPage.statusFilter).toBeVisible();
  await expect(boardPage.searchBox).toBeVisible();

  await boardPage.typeFilter.click();
  await page.getByRole("option", { name: PROJECT_TYPE_NAMES.COMMERCIAL }).click();
  await boardPage.searchBox.fill(building.name);

  await expect(boardPage.card.getByText(BOARD_COPY.NO_RESULTS)).toBeVisible();
  await expect(boardPage.findRow(building.name)).toHaveCount(0);
  await boardPage.statusFilter.click();
  await expect(boardPage.statusOption(BOARD_COPY.ALL_STATUSES, 0)).toBeVisible();
  await boardPage.statusFilter.press("Escape");

  await boardPage.searchBox.fill(commercial.name);

  await expect(boardPage.findRow(commercial.name)).toBeVisible();
  await boardPage.statusFilter.click();
  await expect(boardPage.statusOption(BOARD_COPY.ALL_STATUSES, 1)).toBeVisible();
  await boardPage.statusOption(PROJECT_STATUS_NAMES.COMPLETED, 0).click();
  await expect(boardPage.card.getByText(BOARD_COPY.NO_RESULTS)).toBeVisible();
  await boardPage.statusFilter.click();
  await boardPage.statusOption(BOARD_COPY.ALL_STATUSES, 1).click();
  await expect(boardPage.findRow(commercial.name)).toBeVisible();
});

test("a new project is counted under its status and found by search", async ({ page, api }) => {
  const boardPage = createBoardPage(page);
  const project = await seedStandaloneProject(api, await seedCustomer(api));
  const notStartedCount = await api.countProjectsInStage(PROJECT_STATUS_NAMES.NOT_STARTED);

  await boardPage.goto();

  await expect(boardPage.statusFilter).toHaveValue(BOARD_COPY.ALL_STATUSES);
  await boardPage.statusFilter.focus();
  await boardPage.statusFilter.press("ArrowDown");
  await expect(page.getByRole("listbox")).toBeVisible();
  await boardPage.statusFilter.press("Tab");
  await expect(boardPage.newProjectButton).toBeFocused();
  await expect(page.getByRole("listbox")).toHaveCount(0);
  await boardPage.statusFilter.click();
  await expect(page.getByRole("option")).toHaveCount(Object.keys(PROJECT_STATUS_NAMES).length + 1);
  for (const name of [BOARD_COPY.ALL_STATUSES, ...Object.values(PROJECT_STATUS_NAMES)]) {
    await expect(boardPage.statusOption(name)).toBeVisible();
  }
  await boardPage.statusOption(PROJECT_STATUS_NAMES.NOT_STARTED, notStartedCount).click();
  await expect(boardPage.statusFilter).toHaveValue(PROJECT_STATUS_NAMES.NOT_STARTED);
  await boardPage.searchBox.fill(project.name);

  await expect(boardPage.findRow(project.name)).toBeVisible();
  await expectSingleResultRow(page);
});

test("the board lists buildings but not their apartments", async ({ page, api }) => {
  const boardPage = createBoardPage(page);
  const building = await seedBuilding(api, await seedCustomer(api));
  const apartment = await seedApartment(api, building);

  await boardPage.goto();
  await boardPage.searchBox.fill(building.code);

  await expect(boardPage.findRow(building.name)).toBeVisible();
  await expect(boardPage.findRow(apartment.code)).toHaveCount(0);
});

test("open a project from the board, change its stage in details, and see the status dropdown and timeline update", async ({
  page,
  api,
}) => {
  const boardPage = createBoardPage(page);
  const projectPage = createProjectPage(page);
  const customer = await seedCustomer(api);
  const unrelatedProject = await seedStandaloneProject(api, customer);
  const inProgressStage = await api.findProjectStage(PROJECT_STATUS_NAMES.IN_PROGRESS);
  const response = await api.send(HTTP_METHODS.PATCH, buildProjectStagePath(unrelatedProject.id), {
    stageId: inProgressStage.id,
  });
  expect(response.ok()).toBe(true);
  const project = await seedStandaloneProject(api, customer);

  await boardPage.goto();
  await boardPage.searchBox.fill(project.name);
  await expectSingleResultRow(page);
  await expect(boardPage.findRow(project.name).getByRole("combobox")).toHaveCount(0);
  await boardPage.findRow(project.name).click();
  await expect(page).toHaveURL(buildProjectRoute(project.id));
  await projectPage.changeStage(PROJECT_STATUS_NAMES.IN_PROGRESS);
  await expect(projectPage.stagePicker).toHaveValue(PROJECT_STATUS_NAMES.IN_PROGRESS);
  await expect
    .poll(async () => (await api.getProject(project.id)).stage.name)
    .toBe(PROJECT_STATUS_NAMES.IN_PROGRESS);

  const timelineEntries = projectPage.timeline.getByRole("listitem");

  await expect(timelineEntries).toHaveCount(TIMELINE_ENTRIES_AFTER_ONE_CHANGE);
  await expect(
    timelineEntries.filter({
      has: page.getByText(PROJECT_STATUS_NAMES.IN_PROGRESS, { exact: true }),
    }),
  ).toHaveCount(1);

  await boardPage.goto();
  await boardPage.searchBox.fill(project.name);

  const filteredCount = await api.countProjectsInStage(
    PROJECT_STATUS_NAMES.IN_PROGRESS,
    project.name,
  );
  const globalCount = await api.countProjectsInStage(PROJECT_STATUS_NAMES.IN_PROGRESS);

  expect(filteredCount).toBe(1);
  expect(globalCount).toBeGreaterThan(filteredCount);
  await boardPage.statusFilter.click();
  await boardPage.statusOption(PROJECT_STATUS_NAMES.IN_PROGRESS, filteredCount).click();
  await expect(boardPage.statusFilter).toHaveValue(PROJECT_STATUS_NAMES.IN_PROGRESS);

  await expect(boardPage.findRow(project.name)).toBeVisible();
  await expect(boardPage.findRow(unrelatedProject.name)).toHaveCount(0);

  await boardPage.searchBox.clear();

  await boardPage.statusFilter.click();
  await expect(boardPage.statusOption(PROJECT_STATUS_NAMES.IN_PROGRESS, globalCount)).toBeVisible();
  await boardPage.statusFilter.press("Escape");
  await expect(boardPage.findRow(project.name)).toBeVisible();
  await expect(boardPage.findRow(unrelatedProject.name)).toBeVisible();
});

test("clicking a board row opens the project page", async ({ page, api }) => {
  const boardPage = createBoardPage(page);
  const project = await seedStandaloneProject(api, await seedCustomer(api));

  await boardPage.goto();
  await boardPage.searchBox.fill(project.name);
  await boardPage.findRow(project.name).getByText(project.name).click();

  await expect(page).toHaveURL(buildProjectRoute(project.id));
});

test.describe("mobile layout", () => {
  test.use(PHONE);

  test("the board lists projects on a phone", async ({ page, api }) => {
    const boardPage = createBoardPage(page);
    const project = await seedStandaloneProject(api, await seedCustomer(api));

    await boardPage.goto();
    await expect(page.getByText("כל המנהלים", { exact: true })).toHaveCount(0);
    await expect(boardPage.typeFilter).toBeVisible();
    await expect(boardPage.statusFilter).toBeVisible();
    await expect
      .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
      .toBe(true);
    await boardPage.searchBox.fill(project.name);

    await expect(page.getByText(project.name)).toBeVisible();
    await expect(
      page
        .getByRole("button", { name: project.name })
        .locator("..")
        .getByText(`${PROJECT_PAGE_COPY.STAGE_PREFIX} ${PROJECT_STATUS_NAMES.NOT_STARTED}`, {
          exact: true,
        }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: project.name }).locator("..").getByRole("combobox"),
    ).toHaveCount(0);
    await page.getByText(project.name).click();
    await expect(page).toHaveURL(buildProjectRoute(project.id));
  });
});
