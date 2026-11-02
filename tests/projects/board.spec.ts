import {
  seedBuilding,
  seedCustomer,
  seedApartment,
  seedStandaloneProject,
} from "../../src/api/seed-data.ts";

import { devices } from "@playwright/test";
import { createBoardPage } from "../../src/pages/board.page.ts";
import { readTabCount } from "../../src/pages/tab.component.ts";
import { test, expect } from "../../src/fixtures/test.fixture.ts";
import { HTTP_METHODS } from "../../src/constants/http.constant.ts";
import { createProjectPage } from "../../src/pages/project.page.ts";
import { buildProjectRoute } from "../../src/utilities/route.utility.ts";
import { expectSingleResultRow } from "../../src/pages/table.component.ts";
import { PROJECT_STATUS_NAMES } from "../../src/constants/domain.constant.ts";
import { buildProjectStagePath } from "../../src/utilities/api-path.utility.ts";

const TIMELINE_ENTRIES_AFTER_ONE_CHANGE = 2;

const { defaultBrowserType: _browserType, ...PHONE } = devices["Pixel 7"];

test("a new project is counted under its status and found by search", async ({ page, api }) => {
  const boardPage = createBoardPage(page);
  const draftTab = boardPage.statusTab(PROJECT_STATUS_NAMES.DRAFT);
  const project = await seedStandaloneProject(api, await seedCustomer(api));
  const draftCount = await api.countProjectsInStage(PROJECT_STATUS_NAMES.DRAFT);

  await boardPage.goto();

  await expect.poll(() => readTabCount(draftTab)).toBe(draftCount);

  await draftTab.click();
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

test("change a project status from the board and see it in the tabs and the timeline", async ({
  page,
  api,
}) => {
  const boardPage = createBoardPage(page);
  const projectPage = createProjectPage(page);
  const inProgressTab = boardPage.statusTab(PROJECT_STATUS_NAMES.IN_PROGRESS);
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
  await boardPage.changeStatus(project.name, PROJECT_STATUS_NAMES.IN_PROGRESS);

  await expect(boardPage.findRow(project.name).getByRole("combobox")).toHaveValue(
    PROJECT_STATUS_NAMES.IN_PROGRESS,
  );

  const filteredCount = await api.countProjectsInStage(
    PROJECT_STATUS_NAMES.IN_PROGRESS,
    project.name,
  );
  const globalCount = await api.countProjectsInStage(PROJECT_STATUS_NAMES.IN_PROGRESS);

  expect(filteredCount).toBe(1);
  expect(globalCount).toBeGreaterThan(filteredCount);
  await expect.poll(() => readTabCount(inProgressTab)).toBe(filteredCount);

  await inProgressTab.click();

  await expect(boardPage.findRow(project.name)).toBeVisible();
  await expect(boardPage.findRow(unrelatedProject.name)).toHaveCount(0);

  await boardPage.searchBox.clear();

  await expect.poll(() => readTabCount(inProgressTab)).toBe(globalCount);
  await expect(boardPage.findRow(project.name)).toBeVisible();
  await expect(boardPage.findRow(unrelatedProject.name)).toBeVisible();

  await projectPage.goto(project.id);

  const timelineEntries = projectPage.timeline.getByRole("listitem");

  await expect(timelineEntries).toHaveCount(TIMELINE_ENTRIES_AFTER_ONE_CHANGE);
  await expect(timelineEntries.filter({ hasText: PROJECT_STATUS_NAMES.IN_PROGRESS })).toHaveCount(
    1,
  );
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
    await boardPage.searchBox.fill(project.name);

    await expect(page.getByText(project.name)).toBeVisible();
  });
});
