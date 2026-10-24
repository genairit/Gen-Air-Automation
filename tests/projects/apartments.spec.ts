import {
  formatStageLabel,
  formatBuildingLink,
  formatApartmentName,
} from "../../src/utilities/apartment.utility.ts";

import { test, expect } from "../../src/fixtures/test.fixture.ts";
import { SEED_VALUES } from "../../src/constants/seed.constant.ts";
import { createProjectPage } from "../../src/pages/project.page.ts";
import { buildApartmentRoute } from "../../src/utilities/route.utility.ts";
import { PROJECT_STATUS_NAMES } from "../../src/constants/domain.constant.ts";
import { readTabCount, expectTabSelected } from "../../src/pages/tab.component.ts";
import { seedBuilding, seedCustomer, seedApartment } from "../../src/api/seed-data.ts";
import { createApartmentPage, createApartmentFormPage } from "../../src/pages/apartment.page.ts";

const NEW_APARTMENT = {
  floor: "4",
  number: "17",
} as const;

const APARTMENT_NOTE = "הדייר זמין רק בבוקר";

const SINGLE_APARTMENT_COUNT = 1;

test("add an apartment to a building and see it listed and counted", async ({ page, api }) => {
  const building = await seedBuilding(api, await seedCustomer(api));
  const projectPage = createProjectPage(page);
  const formPage = createApartmentFormPage(page);

  await projectPage.goto(building.id);
  await projectPage.addApartmentButton.click();
  const customer = await seedCustomer(api);
  await formPage.fill({ ...NEW_APARTMENT, customerName: customer.name });
  await formPage.submitButton.click();

  await expect(page).toHaveURL(new RegExp(`/projects/${building.id}$`));

  await expect(
    projectPage.findApartmentRow(formatApartmentName(NEW_APARTMENT.number)),
  ).toBeVisible();
  await expect
    .poll(() => readTabCount(projectPage.statusTab(PROJECT_STATUS_NAMES.PENDING)))
    .toBe(SINGLE_APARTMENT_COUNT);
});

test("an apartment page shows its contact and the values inherited from the building", async ({
  page,
  api,
}) => {
  const building = await seedBuilding(api, await seedCustomer(api));
  const apartment = await seedApartment(api, building);
  const apartmentPage = createApartmentPage(page);

  await apartmentPage.goto(building.id, apartment.id);

  await expect(page.getByText(apartment.code)).toBeVisible();
  await expect(page.getByText(SEED_VALUES.CUSTOMER_CONTACT_NAME)).toBeVisible();
  await expect(page.getByRole("link", { name: formatBuildingLink(building.name) })).toBeVisible();
});

test("change an apartment stage independently of its building", async ({ page, api }) => {
  const building = await seedBuilding(api, await seedCustomer(api));
  const apartment = await seedApartment(api, building);
  const apartmentPage = createApartmentPage(page);
  const projectPage = createProjectPage(page);

  await apartmentPage.goto(building.id, apartment.id);
  await apartmentPage.stageTab(PROJECT_STATUS_NAMES.IN_PROGRESS).click();

  await expectTabSelected(apartmentPage.stageTab(PROJECT_STATUS_NAMES.IN_PROGRESS));

  await projectPage.goto(building.id);

  await expect
    .poll(() => readTabCount(projectPage.statusTab(PROJECT_STATUS_NAMES.IN_PROGRESS)))
    .toBe(SINGLE_APARTMENT_COUNT);
  await expect(page.getByText(formatStageLabel(PROJECT_STATUS_NAMES.PENDING))).toBeVisible();
});

test("save notes on an apartment", async ({ page, api }) => {
  const building = await seedBuilding(api, await seedCustomer(api));
  const apartment = await seedApartment(api, building);
  const apartmentPage = createApartmentPage(page);

  await apartmentPage.goto(building.id, apartment.id);
  await apartmentPage.notesInput.fill(APARTMENT_NOTE);
  await apartmentPage.saveNotesButton.click();

  await expect(apartmentPage.saveNotesButton).toBeDisabled();

  await page.reload();

  await expect(apartmentPage.notesInput).toHaveValue(APARTMENT_NOTE);
});

test("move between apartments of the same building", async ({ page, api }) => {
  const building = await seedBuilding(api, await seedCustomer(api));
  const firstApartment = await seedApartment(api, building);
  const secondApartment = await seedApartment(api, building);
  const apartmentPage = createApartmentPage(page);

  await apartmentPage.goto(building.id, firstApartment.id);
  await apartmentPage.nextButton.click();

  await expect(page).toHaveURL(buildApartmentRoute(building.id, secondApartment.id));
});

test("opening an apartment row from the building goes to the apartment page", async ({
  page,
  api,
}) => {
  const building = await seedBuilding(api, await seedCustomer(api));
  const apartment = await seedApartment(api, building);
  const projectPage = createProjectPage(page);

  await projectPage.goto(building.id);
  await projectPage.findApartmentRow(apartment.name).getByText(apartment.name).click();

  await expect(page).toHaveURL(buildApartmentRoute(building.id, apartment.id));
});
