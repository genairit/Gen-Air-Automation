import {
  seedTask,
  seedBuilding,
  seedCustomer,
  seedApartment,
  linkToProject,
  buildCustomerInput,
  seedStandaloneProject,
} from "../../src/api/seed-data.ts";

import type { Page } from "@playwright/test";
import { test, expect } from "../../src/fixtures/test.fixture.ts";
import { createTaskFormPage } from "../../src/pages/tasks.page.ts";
import { findCardByTitle } from "../../src/pages/card.component.ts";
import { createProjectPage } from "../../src/pages/project.page.ts";
import { TASK_TYPES } from "../../src/constants/domain.constant.ts";
import { TASK_FORM_COPY } from "../../src/constants/copy.constant.ts";
import { USER_ROLES } from "../../src/constants/user-role.constant.ts";
import { createApartmentPage } from "../../src/pages/apartment.page.ts";
import { TEST_USERS } from "../../src/constants/test-users.constant.ts";
import { PERMISSIONS } from "../../src/constants/permission.constant.ts";
import { createUniqueName } from "../../src/utilities/test-data.utility.ts";
import { withRolePermissions } from "../../src/environment/role-permissions.ts";
import { buildImportRow } from "../../src/utilities/apartment-import.utility.ts";
import { uploadApartments, readBuildingApartments } from "../../src/api/apartment-import.api.ts";

const TASKS_TITLE = "משימות הפרויקט";

const expectTasksImmediatelyAfterHeader = async (page: Page) => {
  const tasksCard = findCardByTitle(page, TASKS_TITLE);
  const header = tasksCard.locator("xpath=preceding-sibling::*[1]");
  const nextContent = tasksCard.locator("xpath=following-sibling::*[1]");
  await expect(tasksCard).toBeVisible();
  await expect(header).toBeVisible();
  await expect(nextContent).toBeVisible();
  const [headerBox, tasksBox, nextBox] = await Promise.all([
    header.boundingBox(),
    tasksCard.boundingBox(),
    nextContent.boundingBox(),
  ]);
  if (!headerBox || !tasksBox || !nextBox) {
    throw new Error("Expected the header, tasks and next section to have visible bounds");
  }
  expect(tasksBox.y).toBeGreaterThanOrEqual(headerBox.y + headerBox.height - 2);
  expect(tasksBox.y - (headerBox.y + headerBox.height)).toBeLessThanOrEqual(40);
  expect(nextBox.y).toBeGreaterThanOrEqual(tasksBox.y + tasksBox.height - 2);
};

test("building, standalone and apartment pages put tasks immediately after the header", async ({
  page,
  api,
}) => {
  const customer = await seedCustomer(api);
  const standalone = await seedStandaloneProject(api, customer);
  const building = await seedBuilding(api, customer);
  const apartment = await seedApartment(api, building);

  for (const project of [standalone, building]) {
    await createProjectPage(page).goto(project.id);
    await expect(page.getByText(`הצעת מחיר — ${project.name}`, { exact: true })).toBeVisible();
    await expectTasksImmediatelyAfterHeader(page);
  }

  await createApartmentPage(page).goto(building.id, apartment.id);
  await expect(page.getByText(`הצעת מחיר — ${apartment.name}`, { exact: true })).toBeVisible();
  await expectTasksImmediatelyAfterHeader(page);
});

test("apartment task card shows only its own tasks and preserves open and General creation flows", async ({
  page,
  api,
}) => {
  const building = await seedBuilding(api, await seedCustomer(api));
  const first = await seedApartment(api, building);
  const second = await seedApartment(api, building);
  const buildingTask = await seedTask(api, { link: linkToProject(building) });
  const firstTask = await seedTask(api, { link: linkToProject(first) });
  const secondTask = await seedTask(api, { link: linkToProject(second) });

  await createApartmentPage(page).goto(building.id, first.id);
  const tasksCard = findCardByTitle(page, TASKS_TITLE);
  await expect(tasksCard.getByText(firstTask.title, { exact: true })).toBeVisible();
  await expect(tasksCard.getByText(`הצעת מחיר — ${first.name}`, { exact: true })).toBeVisible();
  await expect(tasksCard.getByText(`תכנון — ${first.name}`, { exact: true })).toBeVisible();
  await expect(tasksCard.getByText(buildingTask.title, { exact: true })).toHaveCount(0);
  await expect(tasksCard.getByText(secondTask.title, { exact: true })).toHaveCount(0);
  await tasksCard.getByText(firstTask.title, { exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/tasks/${firstTask.id}$`));

  await createApartmentPage(page).goto(building.id, first.id);
  await createProjectPage(page).newTaskButton.click();
  const form = createTaskFormPage(page);
  await expect(form.form.getByText(first.name, { exact: true })).toBeVisible();
  await expect(form.form.getByText("כללי", { exact: true })).toBeVisible();
  await expect(form.form.getByRole("radio", { name: /הצעת מחיר|תכנון/ })).toHaveCount(0);
  const newTitle = createUniqueName("משימת דירה");
  await form.form.getByPlaceholder(TASK_FORM_COPY.TITLE_PLACEHOLDER).fill(newTitle);
  await form.form
    .getByPlaceholder(TASK_FORM_COPY.DESCRIPTION_PLACEHOLDER)
    .fill("תיאום עבודה בדירה");
  await form.saveButton.click();
  await expect(page).toHaveURL(/\/tasks\/[a-f0-9-]+$/);
  expect((await api.getProjectTasks(first.id)).items).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ title: newTitle, taskType: TASK_TYPES.GENERAL }),
    ]),
  );

  await createApartmentPage(page).goto(building.id, second.id);
  await expect(findCardByTitle(page, TASKS_TITLE).getByText(secondTask.title)).toBeVisible();
  await expect(findCardByTitle(page, TASKS_TITLE).getByText(firstTask.title)).toHaveCount(0);
  await expect(findCardByTitle(page, TASKS_TITLE).getByText(newTitle)).toHaveCount(0);
});

test("Excel-imported apartment displays its mandatory pair exactly once after reimport", async ({
  page,
  api,
}) => {
  const building = await seedBuilding(api, await seedCustomer(api));
  const row = buildImportRow(buildCustomerInput());
  expect((await uploadApartments(api, building.id, [row])).counts.created).toBe(1);
  const [imported] = await readBuildingApartments(api, building.id);
  const apartment = await api.getProject(imported.id);
  await createApartmentPage(page).goto(building.id, apartment.id);
  const tasksCard = findCardByTitle(page, TASKS_TITLE);
  await expect(tasksCard.getByText(`הצעת מחיר — ${apartment.name}`, { exact: true })).toBeVisible();
  await expect(tasksCard.getByText(`תכנון — ${apartment.name}`, { exact: true })).toBeVisible();
  expect((await uploadApartments(api, building.id, [row])).counts.existing).toBe(1);
  await page.reload();
  await expect(
    findCardByTitle(page, TASKS_TITLE).getByRole("button", { name: /הצעת מחיר —/ }),
  ).toHaveCount(1);
  await expect(
    findCardByTitle(page, TASKS_TITLE).getByRole("button", { name: /תכנון —/ }),
  ).toHaveCount(1);
});

test("apartment hides task card and task requests without tasks read permission", async ({
  api,
  apiAs,
  openPageAs,
}) => {
  const building = await seedBuilding(api, await seedCustomer(api));
  const apartment = await seedApartment(api, building);
  const finance = USER_ROLES.FINANCE;
  const actor = await apiAs(TEST_USERS[finance]);
  await withRolePermissions(
    finance,
    actor.session.user.permissions.filter(permission => permission !== PERMISSIONS.TASKS_READ),
    async () => {
      const page = await openPageAs(TEST_USERS[finance]);
      const taskRequests: string[] = [];
      page.on("request", request => {
        if (new URL(request.url()).pathname.startsWith("/api/task")) {
          taskRequests.push(request.url());
        }
      });
      await createApartmentPage(page).goto(building.id, apartment.id);
      await expect(page.getByText(apartment.code)).toBeVisible();
      await expect(page.getByRole("heading", { name: TASKS_TITLE })).toHaveCount(0);
      expect(taskRequests).toEqual([]);
    },
  );
});
