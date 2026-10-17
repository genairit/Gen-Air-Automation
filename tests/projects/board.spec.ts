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
import { createProjectPage } from "../../src/pages/project.page.ts";
import { buildProjectRoute } from "../../src/utilities/route.utility.ts";
import { expectSingleResultRow } from "../../src/pages/table.component.ts";
import { PROJECT_STATUS_NAMES } from "../../src/constants/domain.constant.ts";

const TIMELINE_ENTRIES_AFTER_ONE_CHANGE = 2;

const { defaultBrowserType: _browserType, ...PHONE } = devices["Pixel 7"];

test("a new project is counted under its status and found by search", async ({ page, api }) => {
  const boardPage = createBoardPage(page);
  const pendingTab = boardPage.statusTab(PROJECT_STATUS_NAMES.PENDING);
  const project = await seedStandaloneProject(api, await seedCustomer(api));
  const pendingCount = await api.countProjectsInStage(PROJECT_STATUS_NAMES.PENDING);

  await boardPage.goto();

  await expect.poll(() => readTabCount(pendingTab)).toBe(pendingCount);

  await pendingTab.click();
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
  const project = await seedStandaloneProject(api, await seedCustomer(api));

  await boardPage.goto();
  await boardPage.searchBox.fill(project.name);
  await boardPage.changeStatus(project.name, PROJECT_STATUS_NAMES.IN_PROGRESS);

  await expect(boardPage.findRow(project.name).getByRole("combobox")).toHaveValue(
    PROJECT_STATUS_NAMES.IN_PROGRESS,
  );

  const inProgressCount = await api.countProjectsInStage(PROJECT_STATUS_NAMES.IN_PROGRESS);

  await expect.poll(() => readTabCount(inProgressTab)).toBe(inProgressCount);

  await inProgressTab.click();

  await expect(boardPage.findRow(project.name)).toBeVisible();

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
