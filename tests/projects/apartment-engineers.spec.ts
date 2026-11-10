import {
  seedTask,
  seedUser,
  seedBuilding,
  seedCustomer,
  linkToProject,
  buildCustomerInput,
  seedStandaloneProject,
} from "../../src/api/seed-data.ts";

import { ROUTES } from "../../src/constants/routes.constant.ts";
import { test, expect } from "../../src/fixtures/test.fixture.ts";
import { escapeRegex } from "../../src/utilities/regex.utility.ts";
import { findCardByTitle } from "../../src/pages/card.component.ts";
import { HTTP_METHODS } from "../../src/constants/http.constant.ts";
import { formatFullName } from "../../src/utilities/user.utility.ts";
import { USER_ROLES } from "../../src/constants/user-role.constant.ts";
import { buildProjectPath } from "../../src/utilities/api-path.utility.ts";
import { buildApartmentRoute } from "../../src/utilities/route.utility.ts";
import { PROJECT_TYPE_NAMES } from "../../src/constants/domain.constant.ts";
import { createProjectFormPage } from "../../src/pages/project-form.page.ts";
import { buildImportRow } from "../../src/utilities/apartment-import.utility.ts";
import { createTaskFormPage, createTaskPage } from "../../src/pages/tasks.page.ts";
import { createApartmentDesignPage } from "../../src/pages/apartment-design.page.ts";
import { createApartmentNumber } from "../../src/utilities/apartment-fixture.utility.ts";
import { APARTMENT_DESIGN_COPY as COPY } from "../../src/constants/apartment-design.constant.ts";
import { uploadApartments, readBuildingApartments } from "../../src/api/apartment-import.api.ts";

const engineerPicker = (page: Parameters<typeof createApartmentDesignPage>[0], title: string) =>
  findCardByTitle(page, title).getByRole("combobox", { name: COPY.ENGINEER });

test("building project forms omit the engineer slot while standalone forms keep it", async ({
  page,
  api,
}) => {
  const projectForm = createProjectFormPage(page);
  await projectForm.goto();
  await page.getByText(PROJECT_TYPE_NAMES.RESIDENTIAL_BUILDING, { exact: true }).click();
  await expect(projectForm.memberSlotPicker(USER_ROLES.ENGINEER)).toHaveCount(0);
  await expect(projectForm.memberSlotPicker(USER_ROLES.INSTALLER)).toBeVisible();
  await page.getByText(PROJECT_TYPE_NAMES.COMMERCIAL, { exact: true }).click();
  await expect(projectForm.memberSlotPicker(USER_ROLES.ENGINEER)).toBeVisible();

  const customer = await seedCustomer(api);
  const building = await seedBuilding(api, customer);
  const standalone = await seedStandaloneProject(api, customer);
  await projectForm.gotoEdit(building.id);
  await expect(projectForm.memberSlotPicker(USER_ROLES.ENGINEER)).toHaveCount(0);
  await expect(projectForm.memberSlotPicker(USER_ROLES.INSTALLER)).toBeVisible();
  await projectForm.gotoEdit(standalone.id);
  await expect(projectForm.memberSlotPicker(USER_ROLES.ENGINEER)).toBeVisible();
});

test("apartment create and detail assign a local engineer while other team reset preserves it", async ({
  page,
  api,
}) => {
  const building = await seedBuilding(api, await seedCustomer(api));
  const customer = await seedCustomer(api);
  const first = await seedUser(api, USER_ROLES.ENGINEER);
  const second = await seedUser(api, USER_ROLES.ENGINEER);
  const installer = await seedUser(api, USER_ROLES.INSTALLER);
  const secretary = await seedUser(api, USER_ROLES.SECRETARY);
  expect(
    (
      await api.send(HTTP_METHODS.PATCH, buildProjectPath(building.id), {
        members: [{ userId: installer.id, role: USER_ROLES.INSTALLER }],
      })
    ).ok(),
  ).toBe(true);

  const form = createApartmentDesignPage(page);
  await form.gotoCreate(building.id);
  const picker = engineerPicker(page, COPY.TEAM_TITLE);
  await expect(form.draftTeam().getByText(COPY.INHERITED, { exact: true })).toBeVisible();
  await expect(
    form.draftTeam().getByText(formatFullName(installer), { exact: true }),
  ).toBeVisible();
  await picker.click();
  await expect(page.getByRole("option").filter({ hasText: formatFullName(first) })).toBeVisible();
  await expect(page.getByRole("option").filter({ hasText: formatFullName(secretary) })).toHaveCount(
    0,
  );
  await page
    .getByRole("option")
    .filter({ hasText: formatFullName(first) })
    .click();
  await form.fillUnit(createApartmentNumber());
  await form.pickCustomer(customer.name);
  await form.submit.click();
  await expect(page).toHaveURL(new RegExp(`/projects/${building.id}$`));

  const apartments = await readBuildingApartments(api, building.id);
  const apartment = apartments.find(item => item.customerId === customer.id);
  if (!apartment) throw new Error("Created apartment missing");
  expect(await api.getProjectMembers(apartment.id)).toEqual([
    expect.objectContaining({ userId: first.id, role: USER_ROLES.ENGINEER }),
  ]);
  await page.goto(buildApartmentRoute(building.id, apartment.id));
  const detailTeam = form.teamCard();
  const detailPicker = engineerPicker(page, COPY.CONTACT_TEAM);
  await expect(detailPicker).toHaveValue(new RegExp(escapeRegex(formatFullName(first))));
  await expect(detailTeam.getByText(COPY.INHERITED, { exact: true })).toBeVisible();
  await detailPicker.click();
  await page
    .getByRole("option")
    .filter({ hasText: formatFullName(second) })
    .click();
  await expect
    .poll(async () => (await api.getProjectMembers(apartment.id))[0]?.userId)
    .toBe(second.id);
  await detailTeam.getByRole("button", { name: COPY.OVERRIDE, exact: true }).click();
  await detailTeam.getByRole("button", { name: COPY.SAVE_TEAM }).click();
  await expect(detailTeam.getByText(COPY.OWN, { exact: true })).toBeVisible();
  await detailTeam.getByRole("button", { name: COPY.RESET_TEAM }).click();
  await expect(detailTeam.getByText(COPY.INHERITED, { exact: true })).toBeVisible();
  await expect(detailTeam.getByText(formatFullName(installer), { exact: true })).toBeVisible();
  await expect(detailPicker).toHaveValue(new RegExp(escapeRegex(formatFullName(second))));
  await page.reload();
  await expect(engineerPicker(page, COPY.CONTACT_TEAM)).toHaveValue(
    new RegExp(escapeRegex(formatFullName(second))),
  );
  await engineerPicker(page, COPY.CONTACT_TEAM).click();
  await page.getByRole("option", { name: COPY.NO_ENGINEER }).click();
  await expect.poll(async () => (await api.getProjectMembers(apartment.id)).length).toBe(0);
});

test("apartment engineer is recommended for task assignment and urgent recipient, standalone options stay ordinary", async ({
  page,
  api,
}) => {
  const customer = await seedCustomer(api);
  const building = await seedBuilding(api, customer);
  const engineer = await seedUser(api, USER_ROLES.ENGINEER);
  const apartment = await api.createApartment(building.id, {
    customerId: (await seedCustomer(api)).id,
    customerFloor: 2,
    customerApartment: createApartmentNumber(),
    engineerUserId: engineer.id,
  });
  const form = createTaskFormPage(page);
  await page.goto(`${ROUTES.NEW_TASK}?projectId=${apartment.id}`);
  const recommended = (await form.openAssigneeOptions()).filter({
    hasText: `${formatFullName(engineer)} · עובד ההנדסה של הדירה`,
  });
  await expect(recommended).toBeVisible();
  await recommended.click();
  await form.form.getByRole("radio", { name: /דחופה/ }).click();
  await expect(
    findCardByTitle(page, "דחיפות").getByText(
      `בשמירה תישלח התראת Push אל ${formatFullName(engineer)}`,
      { exact: true },
    ),
  ).toBeVisible();

  const task = await seedTask(api, { link: linkToProject(apartment) });
  const taskPage = createTaskPage(page);
  await taskPage.goto(task.id);
  await expect(
    (await taskPage.openAssigneeOptions()).filter({
      hasText: `${formatFullName(engineer)} · עובד ההנדסה של הדירה`,
    }),
  ).toBeVisible();

  const standalone = await seedStandaloneProject(api, customer);
  await page.goto(`${ROUTES.NEW_TASK}?projectId=${standalone.id}`);
  await expect(
    (await form.openAssigneeOptions()).filter({ hasText: formatFullName(engineer) }),
  ).toBeVisible();
  await expect(page.getByText("עובד ההנדסה של הדירה")).toHaveCount(0);
});

test("Excel-imported apartment starts with no engineer and permits a later local assignment", async ({
  page,
  api,
}) => {
  const building = await seedBuilding(api, await seedCustomer(api));
  const engineer = await seedUser(api, USER_ROLES.ENGINEER);
  const row = buildImportRow(buildCustomerInput());
  expect((await uploadApartments(api, building.id, [row])).counts.created).toBe(1);
  const [apartment] = await readBuildingApartments(api, building.id);
  await page.goto(buildApartmentRoute(building.id, apartment.id));
  const picker = engineerPicker(page, COPY.CONTACT_TEAM);
  await expect(picker).toHaveValue(COPY.NO_ENGINEER);
  await picker.click();
  await page
    .getByRole("option")
    .filter({ hasText: formatFullName(engineer) })
    .click();
  await expect
    .poll(async () => (await api.getProjectMembers(apartment.id))[0]?.userId)
    .toBe(engineer.id);
});
