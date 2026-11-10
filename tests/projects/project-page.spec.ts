import {
  seedTask,
  seedBuilding,
  seedCustomer,
  seedApartment,
  linkToProject,
  seedStandaloneProject,
} from "../../src/api/seed-data.ts";

import {
  buildBrowserApiPath,
  buildProjectStagePath,
  buildBrowserApiPattern,
} from "../../src/utilities/api-path.utility.ts";

import { test, expect } from "../../src/fixtures/test.fixture.ts";
import { createProjectPage } from "../../src/pages/project.page.ts";
import { PROJECT_PAGE_COPY } from "../../src/constants/copy.constant.ts";
import { FAKE_PLACES } from "../../src/constants/fake-places.constant.ts";
import { buildEditProjectRoute } from "../../src/utilities/route.utility.ts";
import { createStageReasonDialog } from "../../src/pages/stage-reason.component.ts";
import { PROJECT_TYPE_NAMES, PROJECT_STATUS_NAMES } from "../../src/constants/domain.constant.ts";

const TIMELINE_ENTRIES_AFTER_CREATION = 1;

const BUILDING_WAITING_REASON = "ממתינים לאישור הוועד";

test("a standalone project page shows its header, intake, customer, team, tasks and timeline", async ({
  page,
  api,
}) => {
  const customer = await seedCustomer(api);
  const project = await seedStandaloneProject(api, customer);
  const task = await seedTask(api, { link: linkToProject(project) });
  const projectPage = createProjectPage(page);

  await projectPage.goto(project.id);

  await expect(projectPage.heading(project.name)).toBeVisible();
  await expect(page.getByText(project.code)).toBeVisible();
  await expect(page.getByText(FAKE_PLACES[0].formattedAddress)).toBeVisible();
  await expect(page.getByText(customer.name)).not.toHaveCount(0);
  await expect(page.getByText(PROJECT_PAGE_COPY.TEAM_TITLE)).toBeVisible();
  await expect(page.getByText(task.title)).toBeVisible();
  await expect(projectPage.timeline.getByRole("listitem")).toHaveCount(
    TIMELINE_ENTRIES_AFTER_CREATION,
  );
  await expect(projectPage.addApartmentButton).toHaveCount(0);
});

test("a building page shows the inherited values and its apartments", async ({ page, api }) => {
  const building = await seedBuilding(api, await seedCustomer(api));
  const apartment = await seedApartment(api, building);
  const projectPage = createProjectPage(page);

  await projectPage.goto(building.id);

  await expect(projectPage.heading(building.name)).toBeVisible();
  await expect(page.getByText(PROJECT_PAGE_COPY.BUILDING_INHERITED)).toBeVisible();
  await expect(page.getByText(PROJECT_TYPE_NAMES.RESIDENTIAL_BUILDING)).not.toHaveCount(0);
  await expect(projectPage.addApartmentButton).toBeVisible();
  await expect(projectPage.findApartmentRow(apartment.name)).toBeVisible();
  await expect(projectPage.stagePicker).toHaveValue(PROJECT_STATUS_NAMES.NOT_STARTED);
  await projectPage.changeStage(PROJECT_STATUS_NAMES.WAITING_RESPONSE);
  await createStageReasonDialog(page).confirm(BUILDING_WAITING_REASON);
  await expect(projectPage.stagePicker).toHaveValue(PROJECT_STATUS_NAMES.WAITING_RESPONSE);
  await expect
    .poll(async () => (await api.getProject(building.id)).stage.name)
    .toBe(PROJECT_STATUS_NAMES.WAITING_RESPONSE);
});

test("choosing the current project stage does not submit a change", async ({ page, api }) => {
  const project = await seedStandaloneProject(api, await seedCustomer(api));
  const projectPage = createProjectPage(page);
  const requests: string[] = [];
  const stagePath = buildBrowserApiPath(buildProjectStagePath(project.id));
  page.on("request", request => {
    if (request.method() === "PATCH" && request.url().endsWith(stagePath)) {
      requests.push(request.url());
    }
  });

  await projectPage.goto(project.id);
  await projectPage.changeStage(PROJECT_STATUS_NAMES.NOT_STARTED);

  await expect(projectPage.stagePicker).toHaveValue(PROJECT_STATUS_NAMES.NOT_STARTED);
  expect(requests).toEqual([]);
});

test("a failed project stage change shows an error and leaves the saved stage intact", async ({
  page,
  api,
}) => {
  const project = await seedStandaloneProject(api, await seedCustomer(api));
  const projectPage = createProjectPage(page);
  await page.route(buildBrowserApiPattern(buildProjectStagePath(project.id)), async route => {
    if (route.request().method() === "PATCH") {
      await route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({ message: "Temporary test failure" }),
      });
      return;
    }
    await route.continue();
  });

  await projectPage.goto(project.id);
  await projectPage.changeStage(PROJECT_STATUS_NAMES.IN_PROGRESS);

  await expect(page.getByRole("alert").filter({ hasText: "Temporary test failure" })).toBeVisible();
  await expect(projectPage.stagePicker).toHaveValue(PROJECT_STATUS_NAMES.NOT_STARTED);
  expect((await api.getProject(project.id)).stage.name).toBe(PROJECT_STATUS_NAMES.NOT_STARTED);
});

test("the edit button on a project page opens the edit form", async ({ page, api }) => {
  const project = await seedStandaloneProject(api, await seedCustomer(api));
  const projectPage = createProjectPage(page);

  await projectPage.goto(project.id);
  await projectPage.editButton.click();

  await expect(page).toHaveURL(buildEditProjectRoute(project.id));
});

test("an unknown project id shows the not-found state", async ({ page }) => {
  const projectPage = createProjectPage(page);

  await projectPage.goto(crypto.randomUUID());

  await expect(page.getByText(PROJECT_PAGE_COPY.NOT_FOUND)).toBeVisible();
});
