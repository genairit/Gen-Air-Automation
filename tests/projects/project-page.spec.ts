import {
  seedTask,
  seedBuilding,
  seedCustomer,
  seedApartment,
  linkToProject,
  seedStandaloneProject,
} from "../../src/api/seed-data.ts";

import { test, expect } from "../../src/fixtures/test.fixture.ts";
import { createProjectPage } from "../../src/pages/project.page.ts";
import { PROJECT_PAGE_COPY } from "../../src/constants/copy.constant.ts";
import { FAKE_PLACES } from "../../src/constants/fake-places.constant.ts";
import { PROJECT_TYPE_NAMES } from "../../src/constants/domain.constant.ts";
import { buildEditProjectRoute } from "../../src/utilities/route.utility.ts";

const TIMELINE_ENTRIES_AFTER_CREATION = 1;

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
