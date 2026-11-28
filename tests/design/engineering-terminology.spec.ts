import {
  seedTask,
  seedUser,
  seedBuilding,
  seedCustomer,
  linkToProject,
  seedStandaloneProject,
} from "../../src/api/seed-data.ts";

import { isRecord } from "../../src/utilities/guard.utility.ts";
import { ROUTES } from "../../src/constants/routes.constant.ts";
import { seedMultiRoleUser } from "../../src/api/multi-role.ts";
import { createBoardPage } from "../../src/pages/board.page.ts";
import { API_PATHS } from "../../src/constants/api.constant.ts";
import { test, expect } from "../../src/fixtures/test.fixture.ts";
import { escapeRegex } from "../../src/utilities/regex.utility.ts";
import { findCardByTitle } from "../../src/pages/card.component.ts";
import { HTTP_METHODS } from "../../src/constants/http.constant.ts";
import { VIEWPORTS } from "../../src/constants/viewport.constant.ts";
import { formatFullName } from "../../src/utilities/user.utility.ts";
import { findFieldByTitle } from "../../src/pages/field.component.ts";
import { TASK_FORM_COPY } from "../../src/constants/copy.constant.ts";
import { createRoleMenu } from "../../src/pages/role-menu.component.ts";
import { createEmployeesPage } from "../../src/pages/employees.page.ts";
import { KEYBOARD_KEYS } from "../../src/constants/keyboard.constant.ts";
import { buildApartmentRoute } from "../../src/utilities/route.utility.ts";
import { createUniqueName } from "../../src/utilities/test-data.utility.ts";
import { createTaskFormPage, createTaskPage } from "../../src/pages/tasks.page.ts";
import { createApartmentNumber } from "../../src/utilities/apartment-fixture.utility.ts";
import { USER_ROLES, USER_ROLE_LABELS } from "../../src/constants/user-role.constant.ts";
import { APARTMENT_DESIGN_COPY } from "../../src/constants/apartment-design.constant.ts";
import { ENGINEERING_TERMINOLOGY_COPY as COPY } from "../../src/constants/engineering-terminology.constant.ts";

const assertMobileFit = async (page: Parameters<typeof createBoardPage>[0]) => {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
};

test("engineering labels preserve role codes, switching permissions, and mobile account controls", async ({
  api,
  page,
  openPageAs,
}) => {
  const employees = createEmployeesPage(page);
  await employees.goto();
  await expect(employees.roleTab(USER_ROLES.ENGINEER)).toBeVisible();
  await employees.openCreate();
  await employees.openRoles();
  await expect(employees.roleOption(USER_ROLES.ENGINEER)).toHaveAccessibleName(
    USER_ROLE_LABELS[USER_ROLES.ENGINEER],
  );

  const user = await seedMultiRoleUser(api, [USER_ROLES.SYSTEM_ADMIN, USER_ROLES.ENGINEER]);
  const actor = await openPageAs(user);
  await actor.setViewportSize(VIEWPORTS.MOBILE);
  await actor.goto(ROUTES.BOARD);
  const board = createBoardPage(actor);
  await expect(board.newProjectButton).toBeVisible();
  const changedRole = actor.waitForResponse(
    response =>
      response.request().method() === HTTP_METHODS.PATCH &&
      new URL(response.url()).pathname.endsWith(API_PATHS.SWITCH_ROLE),
  );
  await createRoleMenu(actor).select(USER_ROLES.ENGINEER);
  expect(await (await changedRole).json()).toMatchObject({
    role: USER_ROLES.ENGINEER,
  });
  await expect(board.newProjectButton).toHaveCount(0);
  await actor.reload();
  await expect(createRoleMenu(actor).trigger).toContainText(USER_ROLE_LABELS[USER_ROLES.ENGINEER]);
  await assertMobileFit(actor);
  await createRoleMenu(actor).select(USER_ROLES.SYSTEM_ADMIN);
  await expect(board.newProjectButton).toBeVisible();
});

test("task pool and apartment worker copy stays readable while assignment remains durable", async ({
  page,
  api,
}) => {
  await page.setViewportSize(VIEWPORTS.MOBILE);
  const form = createTaskFormPage(page);
  await form.goto();
  await expect(form.form.getByText(COPY.POOL_HINT, { exact: true })).toBeVisible();
  const poolOption = (await form.openAssigneeOptions()).filter({
    hasText: TASK_FORM_COPY.POOL_OPTION,
  });
  await expect(poolOption).toBeVisible();
  const poolBounds = await poolOption.evaluate(element => {
    const bounds = element.getBoundingClientRect();
    return {
      left: bounds.left,
      right: bounds.right,
      clipped: element.scrollWidth > element.clientWidth,
    };
  });
  expect(poolBounds.left).toBeGreaterThanOrEqual(0);
  expect(poolBounds.right).toBeLessThanOrEqual(VIEWPORTS.MOBILE.width);
  expect(poolBounds.clipped).toBe(false);
  await page.keyboard.press(KEYBOARD_KEYS.ESCAPE);

  const building = await seedBuilding(api, await seedCustomer(api));
  const engineer = await seedUser(api, USER_ROLES.ENGINEER);
  const other = await seedUser(api, USER_ROLES.ENGINEER);
  const apartment = await api.createApartment(building.id, {
    customerId: (await seedCustomer(api)).id,
    customerFloor: 1,
    customerApartment: createApartmentNumber(),
    engineerUserId: engineer.id,
  });
  await page.setViewportSize(VIEWPORTS.MOBILE);
  await page.goto(buildApartmentRoute(building.id, apartment.id));
  await expect(page.getByText(COPY.APARTMENT_SUBTITLE, { exact: true })).toBeVisible();
  await expect(page.getByRole("combobox", { name: APARTMENT_DESIGN_COPY.ENGINEER })).toHaveValue(
    new RegExp(escapeRegex(formatFullName(engineer))),
  );
  await assertMobileFit(page);

  const task = await seedTask(api, { link: linkToProject(apartment), assigneeId: other.id });
  const taskPage = createTaskPage(page);
  await taskPage.goto(task.id);
  const options = await taskPage.openAssigneeOptions();
  await expect(
    options.filter({ hasText: `${formatFullName(other)} · ${COPY.OTHER_ASSIGNEE}` }),
  ).toBeVisible();
  await page.keyboard.press(KEYBOARD_KEYS.ESCAPE);
  await assertMobileFit(page);
  expect((await api.getProjectTasks(apartment.id)).items).toContainEqual(
    expect.objectContaining({ id: task.id, assigneeId: other.id }),
  );
});

test("new contact suggestion uses engineering wording without rewriting a legacy contact role or name", async ({
  page,
  api,
}) => {
  const project = await seedStandaloneProject(api, await seedCustomer(api));
  const originalName = createUniqueName("מהנדסת קשר שמור");
  const directory = await api.send(HTTP_METHODS.POST, "/contact-directory", {
    name: originalName,
    role: COPY.LEGACY_CONTACT_ROLE,
  });
  expect(directory.status()).toBe(201);
  const legacy: unknown = await directory.json();
  if (!isRecord(legacy) || typeof legacy.id !== "string") {
    throw new Error("Contact response must contain an id");
  }

  expect(
    (
      await api.send(HTTP_METHODS.POST, `/project/${project.id}/contacts`, {
        contactId: legacy.id,
        role: COPY.LEGACY_CONTACT_ROLE,
        isPrimary: true,
      })
    ).status(),
  ).toBe(201);
  await page.goto(`/projects/${project.id}`);
  const card = findCardByTitle(page, "אנשי קשר בפרויקט או בדירה");
  await card.getByRole("button", { name: "ערוך איש קשר", exact: true }).click();
  await expect(findFieldByTitle(card, "תפקיד")).toHaveValue(COPY.LEGACY_CONTACT_ROLE);
  await expect(card.getByRole("button", { name: COPY.CONTACT_ROLE, exact: true })).toBeVisible();
  const savedName = `${originalName} מעודכן`;
  await findFieldByTitle(card, "שם").fill(savedName);
  await card.getByRole("button", { name: "שמירה", exact: true }).click();
  await expect(card.getByText(savedName, { exact: false }).first()).toBeVisible();
  await page.reload();
  await card.getByRole("button", { name: "ערוך איש קשר", exact: true }).click();
  await expect(findFieldByTitle(card, "תפקיד")).toHaveValue(COPY.LEGACY_CONTACT_ROLE);
  await expect(findFieldByTitle(card, "שם")).toHaveValue(savedName);
  await card.getByRole("button", { name: "ביטול", exact: true }).click();

  await card.getByRole("button", { name: "צור איש קשר במדריך", exact: true }).click();
  const newName = createUniqueName("קשר הנדסי חדש");
  await findFieldByTitle(card, "שם").fill(newName);
  await card.getByRole("button", { name: COPY.CONTACT_ROLE, exact: true }).click();
  await expect(findFieldByTitle(card, "תפקיד")).toHaveValue(COPY.CONTACT_ROLE);
  await card.getByRole("button", { name: "שמירה", exact: true }).click();
  await expect(card.getByText(newName, { exact: false }).first()).toBeVisible();
  const contacts = await api.send(
    HTTP_METHODS.GET,
    `/contact-directory?search=${encodeURIComponent(newName)}`,
  );
  expect(await contacts.json()).toContainEqual(
    expect.objectContaining({ name: newName, role: COPY.CONTACT_ROLE }),
  );
});
