import {
  seedUser,
  seedTask,
  seedBuilding,
  seedCustomer,
  linkToProject,
} from "../../src/api/seed-data.ts";

import {
  recreateLegacyApartment,
  setApartmentCustomerSyncStatus,
} from "../../src/environment/apartment-legacy-data.ts";

import {
  APARTMENT_DESIGN_COPY as COPY,
  APARTMENT_DESIGN_DATA as DATA,
} from "../../src/constants/apartment-design.constant.ts";

import type { TGenAirApi } from "../../src/api/gen-air-api.ts";
import { createTaskPage } from "../../src/pages/tasks.page.ts";
import { isRecord } from "../../src/utilities/guard.utility.ts";
import { test, expect } from "../../src/fixtures/test.fixture.ts";
import { mockDriveContents } from "../../src/mocks/drive.mock.ts";
import { SEED_VALUES } from "../../src/constants/seed.constant.ts";
import { buildTaskRoute } from "../../src/utilities/route.utility.ts";
import { USER_ROLES } from "../../src/constants/user-role.constant.ts";
import { TEST_USERS } from "../../src/constants/test-users.constant.ts";
import { buildProjectPath } from "../../src/utilities/api-path.utility.ts";
import { HTTP_METHODS, HTTP_STATUS } from "../../src/constants/http.constant.ts";
import { API_PATHS, API_PROXY_PREFIX } from "../../src/constants/api.constant.ts";
import { expectResponseOk } from "../../src/utilities/response-assertion.utility.ts";
import { createApartmentDesignPage } from "../../src/pages/apartment-design.page.ts";
import { LEGACY_APARTMENT } from "../../src/constants/apartment-backend.constant.ts";
import type { IProject, ICustomer } from "../../src/interfaces/entities.interface.ts";
import { buildApartmentRoute, buildProjectRoute } from "../../src/utilities/route.utility.ts";
import { CUSTOMER_SYNC_STATUSES, PAYMENT_TERMS } from "../../src/constants/domain.constant.ts";

const readProject = async (api: TGenAirApi, id: string): Promise<Record<string, unknown>> => {
  const response = await api.send(HTTP_METHODS.GET, buildProjectPath(id));
  await expectResponseOk(response);
  const body: unknown = await response.json();
  if (!isRecord(body)) {
    throw new Error("Expected project object");
  }
  return body;
};
const patchProject = async (api: TGenAirApi, id: string, changes: object) => {
  await expectResponseOk(await api.send(HTTP_METHODS.PATCH, buildProjectPath(id), changes));
};
const scenario = async (api: TGenAirApi) => {
  const owner = await seedCustomer(api);
  const customer = await seedCustomer(api);
  const building = await seedBuilding(api, owner);
  return { owner, customer, building };
};
const createApartment = (
  api: TGenAirApi,
  building: IProject,
  customer: ICustomer,
  changes: object = {},
) =>
  api.createApartment(building.id, {
    customerId: customer.id,
    customerFloor: 7,
    customerApartment: DATA.NUMBER,
    ...changes,
  });
const findCreated = async (api: TGenAirApi, building: IProject, customer: ICustomer) => {
  const response = await api.send(HTTP_METHODS.GET, `${buildProjectPath(building.id)}/apartments`);
  await expectResponseOk(response);
  const body: unknown = await response.json();
  if (!isRecord(body) || !Array.isArray(body.items)) {
    throw new Error("Expected apartment page");
  }
  const apartment = body.items.find(item => isRecord(item) && item.customerId === customer.id);
  if (!isRecord(apartment) || typeof apartment.id !== "string") {
    throw new Error("Created apartment missing");
  }
  return readProject(api, apartment.id);
};

test("apartment creation matches required fields, validation count and customer-only contact entry", async ({
  page,
  api,
}, testInfo) => {
  const { building, customer } = await scenario(api);
  const form = createApartmentDesignPage(page);
  await form.gotoCreate(building.id);
  await expect(page.getByText(COPY.CUSTOMER_TITLE, { exact: true })).toBeVisible();
  await expect(page.getByRole("option").filter({ hasText: customer.name })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("add-apartment-desktop.png"), fullPage: true });
  await form.submit.click();
  await expect(page.getByText(COPY.VALIDATION_COUNT, { exact: true })).toBeVisible();
  await expect(page.getByText(COPY.CUSTOMER_REQUIRED, { exact: true })).toBeVisible();
  await expect(page.getByText(COPY.BLOCKED, { exact: true })).toHaveCount(0);
  await expect(page.getByRole("textbox")).toHaveCount(2);
  await expect(page.getByRole("searchbox")).toHaveCount(1);
  await expect(page.getByRole("link", { name: COPY.NEW_CUSTOMER })).toHaveAttribute(
    "href",
    "/customers/new",
  );
  await expect(page.getByRole("link", { name: COPY.NEW_CUSTOMER })).toHaveAttribute(
    "target",
    "_blank",
  );
  await form.fillUnit("24aa");
  await form.pickCustomer(customer.name);
  await form.submit.click();
  await expect(page.getByText(/מספר דירה בפורמט 24 או 24א/)).toBeVisible();
  await form.fillUnit(DATA.NUMBER);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: testInfo.outputPath("add-apartment-mobile.png"), fullPage: true });
  await form.submit.click();
  await expect(page).toHaveURL(new RegExp(`${buildProjectRoute(building.id)}$`));
  const created = await findCreated(api, building, customer);
  expect(created).toMatchObject({
    customerId: customer.id,
    customerApartment: DATA.NUMBER,
    customerFloor: 7,
    hasOwnTeam: false,
    contactName: customer.contactName,
  });
});

test("customer picker searches name, tax ID, contact and phone and rejects failed sync customers", async ({
  page,
  api,
}) => {
  const { building, customer } = await scenario(api);
  const failed = await seedCustomer(api);
  await setApartmentCustomerSyncStatus(failed.id, CUSTOMER_SYNC_STATUSES.FAILED);
  const form = createApartmentDesignPage(page);
  await form.gotoCreate(building.id);
  for (const query of [
    customer.name,
    customer.taxId,
    customer.contactName,
    SEED_VALUES.CUSTOMER_PHONE,
  ]) {
    const searchResponse = page.waitForResponse(response => {
      const url = new URL(response.url());
      return (
        url.pathname === `${API_PROXY_PREFIX}${API_PATHS.CUSTOMER}` &&
        url.searchParams.get("search") === query &&
        response.ok()
      );
    });
    await form.search.fill(query);
    await searchResponse;
    await expect(page.getByRole("option").filter({ hasText: customer.name })).toBeVisible();
  }
  await form.search.fill(failed.name);
  await expect(page.getByRole("option").filter({ hasText: failed.name })).toBeDisabled();
  await expect(page.getByText(COPY.BLOCKED, { exact: true })).toBeVisible();
  await form.pickCustomer(customer.name);
  await expect(page.getByText(customer.contactName, { exact: false }).last()).toBeVisible();
  await expect(page.getByText(SEED_VALUES.CUSTOMER_PHONE, { exact: false }).last()).toBeVisible();
  await page.getByRole("button", { name: COPY.REPLACE_CUSTOMER }).click();
  await expect(form.search).toBeVisible();
});

test("customer lookup exposes loading and a recoverable lookup failure", async ({ page, api }) => {
  const { building, customer } = await scenario(api);
  const pattern = `**${API_PROXY_PREFIX}${API_PATHS.CUSTOMER}?**`;
  const pendingGate: { release: (() => void) | null } = { release: null };
  const gate = new Promise<void>(resolve => {
    pendingGate.release = resolve;
  });
  await page.route(pattern, async route => {
    await gate;
    await route.fulfill({
      status: HTTP_STATUS.INTERNAL_SERVER_ERROR,
      json: { message: DATA.CUSTOMERS_FAILURE },
    });
  });
  const form = createApartmentDesignPage(page);
  await form.gotoCreate(building.id);
  await expect(page.getByText(COPY.LOADING, { exact: true })).toBeVisible();
  pendingGate.release?.();
  await expect(page.getByRole("alert").filter({ hasText: DATA.CUSTOMERS_FAILURE })).toBeVisible();
  await page.unroute(pattern);
  await page.getByRole("button", { name: COPY.RETRY, exact: true }).click();
  await expect(page.getByRole("option").filter({ hasText: customer.name })).toBeVisible();
});

test("duplicate apartment number keeps the form and displays the building-specific Hebrew error", async ({
  page,
  api,
}) => {
  const { building, customer } = await scenario(api);
  await createApartment(api, building, customer);
  const form = createApartmentDesignPage(page);
  await form.gotoCreate(building.id);
  await form.fillUnit(DATA.NUMBER);
  await form.pickCustomer(customer.name);
  await form.submit.click();
  await expect(page.getByText(new RegExp(`דירה ${DATA.NUMBER} כבר קיימת בבניין`))).toBeVisible();
  await expect(form.submit).toBeEnabled();
});

test("creation copies building team, supports an empty own team, and resets before submission", async ({
  page,
  api,
}) => {
  const { building, customer } = await scenario(api);
  const engineer = await seedUser(api, USER_ROLES.ENGINEER);
  await patchProject(api, building.id, {
    members: [{ userId: engineer.id, role: USER_ROLES.ENGINEER }],
  });
  const form = createApartmentDesignPage(page);
  await form.gotoCreate(building.id);
  const team = form.draftTeam();
  await expect(team.getByText(COPY.INHERITED, { exact: true })).toBeVisible();
  await expect(
    team.getByText(`${engineer.firstName} ${engineer.lastName}`, { exact: true }),
  ).toBeVisible();
  await team.getByRole("button", { name: COPY.OVERRIDE, exact: true }).click();
  await team.getByRole("button", { name: new RegExp(COPY.REMOVE_MEMBER) }).click();
  await expect(team.getByText(COPY.EMPTY_TEAM, { exact: true })).toBeVisible();
  await team.getByRole("button", { name: COPY.RESET_TEAM }).click();
  await expect(team.getByText(COPY.INHERITED, { exact: true })).toBeVisible();
  await expect(
    team.getByText(`${engineer.firstName} ${engineer.lastName}`, { exact: true }),
  ).toBeVisible();
  await team.getByRole("button", { name: COPY.OVERRIDE, exact: true }).click();
  await team.getByRole("button", { name: new RegExp(COPY.REMOVE_MEMBER) }).click();
  await form.fillUnit(DATA.NUMBER);
  await form.pickCustomer(customer.name);
  await form.submit.click();
  await expect(page).toHaveURL(new RegExp(`${buildProjectRoute(building.id)}$`));
  expect(await findCreated(api, building, customer)).toMatchObject({
    hasOwnTeam: true,
    members: [],
  });
});

test("creation adds an apartment-only team member and persists its assignment", async ({
  page,
  api,
}) => {
  const { building, customer } = await scenario(api);
  const engineer = await seedUser(api, USER_ROLES.ENGINEER);
  const form = createApartmentDesignPage(page);
  await form.gotoCreate(building.id);
  await form.draftTeam().getByRole("button", { name: COPY.OVERRIDE, exact: true }).click();
  await form.selectMember(engineer.firstName);
  await form.fillUnit(DATA.NUMBER);
  await form.pickCustomer(customer.name);
  await form.submit.click();
  await expect(page).toHaveURL(new RegExp(`${buildProjectRoute(building.id)}$`));
  expect(await findCreated(api, building, customer)).toMatchObject({
    hasOwnTeam: true,
    members: [expect.objectContaining({ userId: engineer.id, role: USER_ROLES.ENGINEER })],
  });
});

test("creation validates custom payment notes, persists an override and can return to parent terms", async ({
  page,
  api,
}) => {
  const { building, customer } = await scenario(api);
  const form = createApartmentDesignPage(page);
  await form.gotoCreate(building.id);
  await form.fillUnit(DATA.NUMBER);
  await form.pickCustomer(customer.name);
  await page.getByRole("button", { name: COPY.OVERRIDE, exact: true }).last().click();
  await page.getByPlaceholder("בחר תנאי תשלום…").click();
  await page.getByRole("option", { name: COPY.TERMS_OTHER, exact: true }).click();
  await form.submit.click();
  await expect(page.getByText(COPY.REQUIRED_TERMS_NOTE, { exact: true })).toBeVisible();
  await page.getByRole("textbox").last().fill(DATA.NOTE);
  await form.submit.click();
  await expect(page).toHaveURL(new RegExp(`${buildProjectRoute(building.id)}$`));
  expect(await findCreated(api, building, customer)).toMatchObject({
    paymentTerms: PAYMENT_TERMS.OTHER,
    paymentTermsNote: DATA.NOTE,
  });
  const second = await seedCustomer(api);
  await form.gotoCreate(building.id);
  await form.fillUnit("25");
  await form.pickCustomer(second.name);
  await page.getByRole("button", { name: COPY.OVERRIDE, exact: true }).last().click();
  await page.getByRole("button", { name: COPY.RETURN_PARENT }).click();
  await form.submit.click();
  await expect(page).toHaveURL(new RegExp(`${buildProjectRoute(building.id)}$`));
  expect(await findCreated(api, building, second)).toMatchObject({
    paymentTerms: PAYMENT_TERMS.MILESTONES_NET_60,
    paymentTermsNote: null,
  });
});

test("detail shows linked customer, named parent customer, callable contact and preserved design cards", async ({
  page,
  api,
}, testInfo) => {
  const { owner, building, customer } = await scenario(api);
  await patchProject(api, building.id, { notes: DATA.PARENT_NOTE });
  const apartment = await createApartment(api, building, customer);
  await mockDriveContents(page, apartment.id);
  await page.goto(buildApartmentRoute(building.id, apartment.id));
  const form = createApartmentDesignPage(page);
  await expect(page.getByText(COPY.END_CUSTOMER, { exact: true })).toBeVisible();
  await expect(page.getByText(customer.name, { exact: true })).toBeVisible();
  await expect(
    page.getByText(
      `לקוח הפרויקט האב: ${owner.name}. הוא אינו לקוח הקצה של הדירה ואינו עובר אליה.`,
      { exact: true },
    ),
  ).toBeVisible();
  await expect(
    form.teamCard().getByRole("link", { name: SEED_VALUES.CUSTOMER_PHONE }),
  ).toHaveAttribute("href", `tel:${SEED_VALUES.CUSTOMER_PHONE}`);
  for (const title of [COPY.PARENT_NOTES, COPY.APARTMENT_NOTES, COPY.DRIVE, COPY.TIMELINE]) {
    await expect(page.getByText(title, { exact: true })).toBeVisible();
  }
  await expect(page.getByText(DATA.PARENT_NOTE, { exact: true })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("apartment-desktop.png"), fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(
    form.teamCard().getByRole("link", { name: SEED_VALUES.CUSTOMER_PHONE }),
  ).toBeVisible();
  const widths = await page.evaluate(() => ({
    content: document.documentElement.scrollWidth,
    viewport: window.innerWidth,
  }));
  expect(widths.content).toBeLessThanOrEqual(widths.viewport);
  await page.screenshot({ path: testInfo.outputPath("apartment-mobile.png"), fullPage: true });
});

test("detail team edits find server-side candidates, add multiple roles, persist empty override and reset live inheritance", async ({
  page,
  api,
}) => {
  const { building, customer } = await scenario(api);
  const engineer = await seedUser(api, USER_ROLES.ENGINEER);
  const installer = await seedUser(api, USER_ROLES.INSTALLER);
  const apartment = await createApartment(api, building, customer);
  await page.route(`**${API_PROXY_PREFIX}${API_PATHS.USER}?**`, async route => {
    const search = new URL(route.request().url()).searchParams.get("search");
    if (!search) {
      await route.fulfill({
        status: HTTP_STATUS.OK,
        json: { items: [], nextCursor: "later-page" },
      });
      return;
    }
    await route.continue();
  });
  const saveFailure = { used: false };
  await page.route(`**${API_PROXY_PREFIX}${API_PATHS.PROJECT}/${apartment.id}`, async route => {
    const shouldFail = route.request().method() === HTTP_METHODS.PATCH && !saveFailure.used;
    if (shouldFail) {
      saveFailure.used = true;
      await route.fulfill({
        status: HTTP_STATUS.INTERNAL_SERVER_ERROR,
        json: { message: DATA.TEAM_SAVE_FAILURE },
      });
      return;
    }
    await route.continue();
  });
  const form = createApartmentDesignPage(page);
  await page.goto(buildApartmentRoute(building.id, apartment.id));
  const team = form.teamCard();
  await team.getByRole("button", { name: COPY.OVERRIDE, exact: true }).click();
  await form.selectMember(engineer.firstName);
  await form.selectMember(installer.firstName);
  await expect(
    team.getByText(`${engineer.firstName} ${engineer.lastName}`, { exact: true }),
  ).toBeVisible();
  await expect(
    team.getByText(`${installer.firstName} ${installer.lastName}`, { exact: true }),
  ).toBeVisible();
  await team.getByRole("button", { name: COPY.SAVE_TEAM }).click();
  await expect(team.getByRole("alert").filter({ hasText: DATA.TEAM_SAVE_FAILURE })).toBeVisible();
  await expect(
    team.getByText(`${engineer.firstName} ${engineer.lastName}`, { exact: true }),
  ).toBeVisible();
  expect(await readProject(api, apartment.id)).toMatchObject({ hasOwnTeam: false, members: [] });
  await team.getByRole("button", { name: COPY.SAVE_TEAM }).click();
  await expect(team.getByRole("button", { name: COPY.SAVE_TEAM })).toHaveCount(0);
  await page.reload();
  await expect(team.getByText(COPY.OWN, { exact: true })).toBeVisible();
  expect(await api.getProjectMembers(apartment.id)).toEqual(
    expect.arrayContaining(
      [
        { userId: engineer.id, role: USER_ROLES.ENGINEER },
        { userId: installer.id, role: USER_ROLES.INSTALLER },
      ].map(member => expect.objectContaining(member)),
    ),
  );
  await team.getByRole("button", { name: COPY.OVERRIDE, exact: true }).click();
  for (const member of [engineer, installer]) {
    await team
      .getByRole("button", {
        name: `${COPY.REMOVE_MEMBER} ${member.firstName} ${member.lastName}`,
        exact: true,
      })
      .click();
  }
  await team.getByRole("button", { name: COPY.SAVE_TEAM }).click();
  await expect(team.getByRole("button", { name: COPY.SAVE_TEAM })).toHaveCount(0);
  await page.reload();
  await expect(team.getByText(COPY.EMPTY_TEAM, { exact: true })).toBeVisible();
  await patchProject(api, building.id, {
    members: [{ userId: installer.id, role: USER_ROLES.INSTALLER }],
  });
  await team.getByRole("button", { name: COPY.RESET_TEAM }).click();
  await expect(team.getByText(COPY.INHERITED, { exact: true })).toBeVisible();
  await expect(
    team.getByText(`${installer.firstName} ${installer.lastName}`, { exact: true }),
  ).toBeVisible();
  expect(await readProject(api, apartment.id)).toMatchObject({ hasOwnTeam: false });
});

test("legacy apartment customer and contact fields remain visible", async ({ page, api }) => {
  const { building, customer } = await scenario(api);
  const apartment = await createApartment(api, building, customer);
  await recreateLegacyApartment(apartment.id);
  await page.goto(buildApartmentRoute(building.id, apartment.id));
  await expect(page.getByText(LEGACY_APARTMENT.CUSTOMER_NAME, { exact: true })).toBeVisible();
  await expect(page.getByText(LEGACY_APARTMENT.CONTACT_NAME, { exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: LEGACY_APARTMENT.CONTACT_PHONE })).toHaveAttribute(
    "href",
    `tel:${LEGACY_APARTMENT.CONTACT_PHONE}`,
  );
});

test("team edit controls follow server permissions for engineering and project managers", async ({
  api,
  openPageAs,
}) => {
  const { building, customer } = await scenario(api);
  const apartment = await createApartment(api, building, customer);
  for (const role of [USER_ROLES.ENGINEER, USER_ROLES.PROJECT_MANAGER]) {
    const page = await openPageAs(TEST_USERS[role]);
    const team = createApartmentDesignPage(page).teamCard();
    await page.goto(buildApartmentRoute(building.id, apartment.id));
    const override = team.getByRole("button", { name: COPY.OVERRIDE, exact: true });
    if (role === USER_ROLES.ENGINEER) {
      await expect(override).toHaveCount(0);
      continue;
    }
    await expect(override).toBeVisible();
    await override.click();
    await expect(team.getByRole("button", { name: COPY.SAVE_TEAM })).toBeVisible();
  }
});

test("tasks linked to a new apartment use its own customer before the building customer", async ({
  page,
  api,
}) => {
  const { building, customer } = await scenario(api);
  const apartment = await createApartment(api, building, customer);
  const task = await seedTask(api, { link: linkToProject(apartment) });
  expect(await api.getTask(task.id)).toMatchObject({
    project: { customer: { id: customer.id, name: customer.name } },
  });
  await page.goto(buildTaskRoute(task.id));
  await expect(createTaskPage(page).projectCustomerLink).toHaveText(customer.name);
});
