import {
  CONTACT_ROLES,
  PROJECT_TYPE_NAMES,
  PAYMENT_TERMS_LABELS,
} from "../../src/constants/domain.constant.ts";

import { ROUTES } from "../../src/constants/routes.constant.ts";
import { createBoardPage } from "../../src/pages/board.page.ts";
import { test, expect } from "../../src/fixtures/test.fixture.ts";
import { FAKE_PLACES } from "../../src/constants/fake-places.constant.ts";
import { buildEditProjectRoute } from "../../src/utilities/route.utility.ts";
import { createProjectFormPage } from "../../src/pages/project-form.page.ts";
import { ROUTE_PATTERNS } from "../../src/constants/route-patterns.constant.ts";
import { seedCustomer, seedStandaloneProject } from "../../src/api/seed-data.ts";
import { createUniqueName, createMobilePhone } from "../../src/utilities/test-data.utility.ts";

const PROJECT_NAME_PREFIXES = {
  NEW: "פרויקט חדש",
  PARTIAL: "פרויקט חלקי",
  RENAMED: "פרויקט ששונה",
} as const;

const NEW_PROJECT_CONTACT_NAME = "יוסי לוי";

test("create a project with a verified address and see it on the board", async ({ page, api }) => {
  const customer = await seedCustomer(api);
  const formPage = createProjectFormPage(page);
  const boardPage = createBoardPage(page);
  const projectName = createUniqueName(PROJECT_NAME_PREFIXES.NEW);

  await boardPage.goto();
  await boardPage.newProjectButton.click();
  await formPage.fill({
    name: projectName,
    place: FAKE_PLACES[1],
    customerName: customer.name,
    contactPhone: createMobilePhone(),
    contactName: NEW_PROJECT_CONTACT_NAME,
    contactRole: CONTACT_ROLES.ENGINEER,
    projectTypeName: PROJECT_TYPE_NAMES.COMMERCIAL,
    paymentTermsLabel: PAYMENT_TERMS_LABELS.MILESTONES_NET_60,
  });

  await expect(formPage.addressVerified).toBeVisible();

  await formPage.createButton.click();

  await expect(page).toHaveURL(ROUTE_PATTERNS.PROJECT);
  await expect(page.getByRole("heading", { name: projectName })).toBeVisible();

  await boardPage.goto();
  await boardPage.searchBox.fill(projectName);

  await expect(boardPage.findRow(projectName)).toBeVisible();
});

test("the create button stays disabled until the required fields are filled", async ({ page }) => {
  const formPage = createProjectFormPage(page);

  await formPage.goto();
  await formPage.nameInput.fill(createUniqueName(PROJECT_NAME_PREFIXES.PARTIAL));

  await expect(formPage.createButton).toBeDisabled();
});

test("edit a project name and see the change on its page", async ({ page, api }) => {
  const customer = await seedCustomer(api);
  const project = await seedStandaloneProject(api, customer);
  const formPage = createProjectFormPage(page);
  const renamedProject = createUniqueName(PROJECT_NAME_PREFIXES.RENAMED);

  await page.goto(buildEditProjectRoute(project.id));
  await formPage.nameInput.fill(renamedProject);
  await formPage.saveButton.click();

  await expect(page).toHaveURL(ROUTE_PATTERNS.PROJECT);
  await expect(page.getByRole("heading", { name: renamedProject })).toBeVisible();
});

test("delete a project removes it from the board", async ({ page, api }) => {
  const customer = await seedCustomer(api);
  const project = await seedStandaloneProject(api, customer);
  const formPage = createProjectFormPage(page);
  const boardPage = createBoardPage(page);

  await page.goto(buildEditProjectRoute(project.id));
  await formPage.deleteButton.click();

  await expect(page).toHaveURL(ROUTES.BOARD);

  await boardPage.searchBox.fill(project.name);

  await expect(boardPage.findRow(project.name)).toHaveCount(0);
});
