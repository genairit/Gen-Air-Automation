import {
  activeRoleSearch,
  contactSearchInput,
  projectContactsSection,
  additionalContactSection,
} from "../../src/pages/contact-search.page.ts";

import {
  readRoleLinks,
  seedRoleContact,
  contactRolePath,
} from "../../src/api/project-contact-roles.api.ts";

import {
  nextPaint,
  directoryQuery,
  isDirectorySearch,
  freezeSearchClock,
  delayDirectorySearch,
  monitorDirectorySearch,
  delayFailedDirectorySearch,
} from "../../src/utilities/contact-search.utility.ts";

import {
  PROJECT_CONTACT_ROLES,
  PROJECT_CONTACT_ROLE_LABELS,
} from "../../src/constants/project-contact-role.constant.ts";

import { test, expect } from "../../src/fixtures/test.fixture.ts";
import { findFieldByTitle } from "../../src/pages/field.component.ts";
import { USER_ROLES } from "../../src/constants/user-role.constant.ts";
import { TEST_USERS } from "../../src/constants/test-users.constant.ts";
import { createDeferred } from "../../src/utilities/deferred.utility.ts";
import { KEYBOARD_KEYS } from "../../src/constants/keyboard.constant.ts";
import { createUniqueName } from "../../src/utilities/test-data.utility.ts";
import { createProjectFormPage } from "../../src/pages/project-form.page.ts";
import { CONTACT_SEARCH } from "../../src/constants/contact-search.constant.ts";
import { HTTP_METHODS, HTTP_STATUS } from "../../src/constants/http.constant.ts";
import { contactRolePicker } from "../../src/pages/project-contact-roles.page.ts";
import { createApartmentNumber } from "../../src/utilities/apartment-fixture.utility.ts";
import { buildProjectRoute, buildApartmentRoute } from "../../src/utilities/route.utility.ts";
import { seedBuilding, seedCustomer, seedStandaloneProject } from "../../src/api/seed-data.ts";

const ARCHITECT = PROJECT_CONTACT_ROLES.ARCHITECT;

test("project create contact pickers stay empty on focus and debounce one normalized query while preserving selection", async ({
  page,
  api,
}) => {
  const contact = await seedRoleContact(api);
  const requests = monitorDirectorySearch(page);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await createProjectFormPage(page).goto();
  const additional = additionalContactSection(page);
  const search = contactSearchInput(additional);
  await search.focus();
  await freezeSearchClock(page);
  try {
    for (const role of Object.values(PROJECT_CONTACT_ROLES)) {
      await contactRolePicker(page, role).click();
      await expect(page.getByRole("option", { disabled: false })).toHaveCount(0);
      await expect(page.getByText(CONTACT_SEARCH.EMPTY, { exact: true }).last()).toBeVisible();
      await activeRoleSearch(page, role).press(KEYBOARD_KEYS.ESCAPE);
      await page.clock.runFor(CONTACT_SEARCH.SETTLE_MS);
    }
    await search.fill("   ");
    await page.clock.runFor(CONTACT_SEARCH.SETTLE_MS);
    expect(requests.queries).toEqual([]);
    await search.fill(contact.name);
    await page.clock.runFor(CONTACT_SEARCH.BEFORE_DEBOUNCE_MS);
    await search.fill("");
    await page.clock.runFor(CONTACT_SEARCH.SETTLE_MS);
    expect(requests.queries).toEqual([]);
    await search.fill(contact.name.slice(0, -1));
    await page.clock.runFor(CONTACT_SEARCH.BEFORE_DEBOUNCE_MS);
    expect(requests.queries).toEqual([]);
    await search.fill(`  ${contact.name}  `);
    await page.clock.runFor(CONTACT_SEARCH.BEFORE_DEBOUNCE_MS);
    expect(requests.queries).toEqual([]);
    await page.clock.runFor(CONTACT_SEARCH.FINAL_DEBOUNCE_MS);
    await expect.poll(() => requests.queries).toEqual([contact.name]);
    await page.clock.resume();
    await expect(
      additional.getByRole("button", { name: `בחר ${contact.name}`, exact: true }),
    ).toBeVisible();
    await additional.getByRole("button", { name: `בחר ${contact.name}`, exact: true }).click();
    await expect(search).toHaveValue("");
    await expect(additional.getByText(contact.name, { exact: false })).toBeVisible();
    await expect(
      additional.getByRole("button", { name: CONTACT_SEARCH.REMOVE, exact: true }),
    ).toBeVisible();
    await expect(
      additional.getByRole("button", { name: `בחר ${contact.name}`, exact: true }),
    ).toHaveCount(0);
    await page.clock.runFor(CONTACT_SEARCH.SETTLE_MS);
    expect(requests.queries).toEqual([contact.name]);
  } finally {
    await page.clock.resume();
    requests.dispose();
  }
});

test("additional and role searches share one in-flight lookup without exposing cached results after clear", async ({
  page,
  api,
}) => {
  const contact = await seedRoleContact(api);
  const requests = monitorDirectorySearch(page);
  const gate = await delayDirectorySearch({ page, query: contact.name });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await createProjectFormPage(page).goto();
  const additional = additionalContactSection(page);
  const search = contactSearchInput(additional);
  try {
    await search.fill(contact.name);
    await gate.started;
    await contactRolePicker(page, ARCHITECT).click();
    await activeRoleSearch(page, ARCHITECT).fill(contact.name);
    await freezeSearchClock(page);
    await page.clock.runFor(CONTACT_SEARCH.SETTLE_MS);
    expect(requests.queries).toEqual([contact.name]);
    await page.clock.resume();
    gate.release();
    await gate.finished;
    await expect(page.getByRole("option").filter({ hasText: contact.name })).toBeVisible();
    await activeRoleSearch(page, ARCHITECT).press(KEYBOARD_KEYS.ENTER);
    await expect(contactRolePicker(page, ARCHITECT)).toHaveValue(contact.name);
    await expect(
      additional.getByRole("button", { name: `בחר ${contact.name}`, exact: true }),
    ).toBeVisible();
    await search.fill("");
    await expect(
      additional.getByRole("button", { name: `בחר ${contact.name}`, exact: true }),
    ).toHaveCount(0);
    await expect(contactRolePicker(page, ARCHITECT)).toHaveValue(contact.name);
    expect(requests.queries).toEqual([contact.name]);
  } finally {
    await page.clock.resume();
    await gate.dispose();
    requests.dispose();
  }
});

test("role search aborts stale lookups and prevents keyboard selection of old results while a new query is pending", async ({
  page,
  api,
}) => {
  const owner = await seedCustomer(api);
  const project = await seedStandaloneProject(api, owner);
  const prior = await seedRoleContact(api);
  const first = await seedRoleContact(api);
  const second = await seedRoleContact(api);
  const stale = await delayFailedDirectorySearch({ page, query: first.name });
  const current = await delayDirectorySearch({ page, query: second.name });
  const requests = monitorDirectorySearch(page);
  await page.goto(buildProjectRoute(project.id));
  try {
    await contactRolePicker(page, ARCHITECT).click();
    const search = activeRoleSearch(page, ARCHITECT);
    await search.fill(prior.name);
    await expect(page.getByRole("option").filter({ hasText: prior.name })).toBeVisible();
    await search.fill(first.name);
    await stale.started;
    await search.fill(second.name);
    await expect(page.getByRole("option", { disabled: false })).toHaveCount(0);
    await search.press(KEYBOARD_KEYS.ENTER);
    expect(await readRoleLinks(api, project.id)).toEqual([]);
    await current.started;
    current.release();
    await current.finished;
    await expect(page.getByRole("option").filter({ hasText: second.name })).toBeVisible();
    stale.release();
    await stale.finished;
    await expect.poll(stale.isAborted).toBe(true);
    await nextPaint(page);
    await expect(page.getByRole("alert")).toHaveCount(0);
    await expect(page.getByRole("option").filter({ hasText: prior.name })).toHaveCount(0);
    await expect(page.getByRole("option").filter({ hasText: first.name })).toHaveCount(0);
    await expect(page.getByRole("option").filter({ hasText: second.name })).toBeVisible();
    await search.press(KEYBOARD_KEYS.ENTER);
    await expect(contactRolePicker(page, ARCHITECT)).toHaveValue(second.name);
    await expect
      .poll(() => readRoleLinks(api, project.id))
      .toContainEqual(expect.objectContaining({ contactId: second.id, role: ARCHITECT }));
    await page.reload();
    await expect(contactRolePicker(page, ARCHITECT)).toHaveValue(second.name);
    expect(requests.queries.every(query => query.trim().length > 0)).toBe(true);
  } finally {
    await Promise.all([stale.dispose(), current.dispose()]);
    requests.dispose();
  }
});

test("current directory errors retry explicitly and clearing cancels pending results without removing linked contacts", async ({
  page,
  api,
}) => {
  const project = await seedStandaloneProject(api, await seedCustomer(api));
  const selected = await seedRoleContact(api);
  const incoming = await seedRoleContact(api);
  const pending = await seedRoleContact(api);
  expect(
    (
      await api.send(HTTP_METHODS.PUT, contactRolePath(project.id, ARCHITECT), {
        contactId: selected.id,
      })
    ).ok(),
  ).toBe(true);
  const attempts = { count: 0, failing: true };
  await page.route(CONTACT_SEARCH.ROUTE, async route => {
    const matches =
      isDirectorySearch(route.request()) && directoryQuery(route.request()) === incoming.name;
    if (!matches) {
      await route.continue();
      return;
    }
    attempts.count += 1;
    if (attempts.failing) {
      await route.fulfill({
        status: HTTP_STATUS.SERVICE_UNAVAILABLE,
        json: { message: CONTACT_SEARCH.FAILED_SEARCH },
      });
      return;
    }
    await route.continue();
  });
  const requests = monitorDirectorySearch(page);
  await page.goto(buildProjectRoute(project.id));
  const section = projectContactsSection(page);
  const search = contactSearchInput(section);
  await search.fill(incoming.name);
  await expect(section.getByRole("alert").first()).toBeVisible();
  await expect(
    section.getByRole("button", { name: CONTACT_SEARCH.RETRY, exact: true }),
  ).toBeVisible();
  const previousAttempts = attempts.count;
  attempts.failing = false;
  await section.getByRole("button", { name: CONTACT_SEARCH.RETRY, exact: true }).click();
  await expect(section.getByRole("button", { name: CONTACT_SEARCH.LINK, exact: true })).toHaveCount(
    1,
  );
  expect(attempts.count).toBe(previousAttempts + 1);
  await search.fill("");
  await expect(
    section.getByRole("button", { name: CONTACT_SEARCH.RETRY, exact: true }),
  ).toHaveCount(0);
  await expect(section.getByRole("button", { name: CONTACT_SEARCH.LINK, exact: true })).toHaveCount(
    0,
  );
  const gate = await delayDirectorySearch({ page, query: pending.name });
  try {
    await search.fill(`${pending.name} `);
    await gate.started;
    await search.fill("   ");
    await expect(
      section.getByRole("button", { name: CONTACT_SEARCH.LINK, exact: true }),
    ).toHaveCount(0);
    gate.release();
    await gate.finished;
    await expect.poll(gate.isAborted).toBe(true);
    await nextPaint(page);
    await expect(
      section.getByRole("button", { name: CONTACT_SEARCH.LINK, exact: true }),
    ).toHaveCount(0);
    await expect(contactRolePicker(page, ARCHITECT)).toHaveValue(selected.name);
    expect(await readRoleLinks(api, project.id)).toContainEqual(
      expect.objectContaining({ contactId: selected.id }),
    );
    expect(requests.queries.every(query => query.trim().length > 0)).toBe(true);
  } finally {
    await gate.dispose();
    requests.dispose();
  }
});

test("empty-query inline contact saves retain errors and refresh links without loading the whole directory", async ({
  page,
  api,
}) => {
  const project = await seedStandaloneProject(api, await seedCustomer(api));
  const name = createUniqueName("קשר שמירה ללא חיפוש");
  const requests = monitorDirectorySearch(page);
  const attempts = { count: 0 };
  const saveStarted = createDeferred();
  const saveReleased = createDeferred();
  const saveFinished = createDeferred();
  await page.route(CONTACT_SEARCH.ROUTE, async route => {
    if (route.request().method() !== HTTP_METHODS.POST) {
      await route.continue();
      return;
    }
    attempts.count += 1;
    if (attempts.count === 1) {
      await route.fulfill({
        status: HTTP_STATUS.SERVICE_UNAVAILABLE,
        json: { message: CONTACT_SEARCH.FAILED_SAVE },
      });
      return;
    }
    if (attempts.count === 2) {
      const response = await route.fetch();
      saveStarted.resolve();
      await saveReleased.promise;
      await route.fulfill({ response });
      saveFinished.resolve();
      return;
    }

    await route.continue();
  });
  await page.goto(buildProjectRoute(project.id));
  const section = projectContactsSection(page);
  await contactSearchInput(section).fill("   ");
  await section.getByRole("button", { name: CONTACT_SEARCH.CREATE, exact: true }).click();
  await findFieldByTitle(section, CONTACT_SEARCH.NAME).fill(name);
  await findFieldByTitle(section, CONTACT_SEARCH.PHONE).fill("+33142278186");
  await section.getByRole("button", { name: CONTACT_SEARCH.SAVE, exact: true }).click();
  await expect(section.getByRole("alert").first()).toBeVisible();
  await expect(contactSearchInput(section)).toBeDisabled();
  await expect(contactSearchInput(section)).toHaveValue("   ");
  await expect(section.getByRole("alert").first()).toBeVisible();
  await expect(findFieldByTitle(section, CONTACT_SEARCH.NAME)).toHaveValue(name);
  try {
    await section.getByRole("button", { name: CONTACT_SEARCH.SAVE, exact: true }).click();
    await saveStarted.promise;
    await expect(contactSearchInput(section)).toBeDisabled();
    expect(requests.queries).toEqual([]);
  } finally {
    saveReleased.resolve();
  }
  await saveFinished.promise;
  await expect(section.getByText(name, { exact: false })).toBeVisible();
  expect(requests.queries).toEqual([]);
  await section.getByRole("button", { name: CONTACT_SEARCH.EDIT, exact: true }).click();
  await findFieldByTitle(section, CONTACT_SEARCH.NAME).fill(`${name} מעודכן`);
  await section.getByRole("button", { name: CONTACT_SEARCH.SAVE, exact: true }).click();
  await expect(section.getByText(`${name} מעודכן`, { exact: false })).toBeVisible();
  await page.reload();
  await expect(section.getByText(`${name} מעודכן`, { exact: false })).toBeVisible();
  expect(requests.queries).toEqual([]);
  requests.dispose();
});

test("apartment mobile search and read-only views preserve contacts without an initial directory request", async ({
  page,
  api,
  openPageAs,
}) => {
  const customer = await seedCustomer(api);
  const building = await seedBuilding(api, customer);
  const apartment = await api.createApartment(building.id, {
    customerId: customer.id,
    customerApartment: createApartmentNumber(),
    customerFloor: 2,
  });
  const contact = await seedRoleContact(api);
  expect(
    (
      await api.send(HTTP_METHODS.PUT, contactRolePath(apartment.id, ARCHITECT), {
        contactId: contact.id,
      })
    ).ok(),
  ).toBe(true);
  const requests = monitorDirectorySearch(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(buildApartmentRoute(building.id, apartment.id));
  const section = projectContactsSection(page);
  await expect(contactRolePicker(page, ARCHITECT)).toHaveValue(contact.name);
  const search = contactSearchInput(section);
  await search.focus();
  await freezeSearchClock(page);
  await page.clock.runFor(CONTACT_SEARCH.SETTLE_MS);
  expect(requests.queries).toEqual([]);
  await page.clock.resume();
  await search.fill(createUniqueName("אין התאמה"));
  await expect(section.getByText(CONTACT_SEARCH.NO_RESULTS, { exact: true })).toBeVisible();
  await search.fill("");
  await expect(section.getByText(CONTACT_SEARCH.NO_RESULTS, { exact: true })).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  const viewer = await openPageAs(TEST_USERS[USER_ROLES.INSTALLER]);
  const viewerRequests = monitorDirectorySearch(viewer);
  await viewer.goto(buildApartmentRoute(building.id, apartment.id));
  await expect(viewer.getByText(contact.name, { exact: true })).toBeVisible();
  await expect(contactSearchInput(projectContactsSection(viewer))).toHaveCount(0);
  await expect(
    viewer.getByRole("combobox", { name: PROJECT_CONTACT_ROLE_LABELS[ARCHITECT], exact: true }),
  ).toHaveCount(0);
  expect(viewerRequests.queries).toEqual([]);
  requests.dispose();
  viewerRequests.dispose();
});

test("role lookup errors and retry remain keyboard accessible inside the open autocomplete", async ({
  page,
  api,
}) => {
  const project = await seedStandaloneProject(api, await seedCustomer(api));
  const contact = await seedRoleContact(api);
  const requests = monitorDirectorySearch(page);
  const responseState = { failing: true };
  await page.route(CONTACT_SEARCH.ROUTE, async route => {
    const matches =
      isDirectorySearch(route.request()) && directoryQuery(route.request()) === contact.name;
    if (!matches || !responseState.failing) {
      await route.continue();
      return;
    }
    await route.fulfill({
      status: HTTP_STATUS.SERVICE_UNAVAILABLE,
      json: { message: CONTACT_SEARCH.LONG_FAILED_SEARCH },
    });
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(buildProjectRoute(project.id));
  await contactRolePicker(page, ARCHITECT).click();
  const search = activeRoleSearch(page, ARCHITECT);
  await search.fill(contact.name);
  const retry = page.getByRole("button", { name: CONTACT_SEARCH.RETRY, exact: true });
  await expect(search).toBeVisible();
  await expect(page.getByRole("alert")).toHaveCount(1);
  await expect(retry).toBeVisible();
  await expect(page.getByText(CONTACT_SEARCH.NO_RESULTS, { exact: true })).toHaveCount(0);
  await search.fill("   ");
  await expect(page.getByRole("alert")).toHaveCount(0);
  await expect(retry).toHaveCount(0);
  await search.fill(contact.name);
  await expect(retry).toBeVisible();
  expect(await retry.evaluate(button => button.closest('[role="listbox"]') === null)).toBe(true);
  const dialog = page.getByRole("dialog", {
    name: PROJECT_CONTACT_ROLE_LABELS[ARCHITECT],
    exact: true,
  });
  const error = dialog.getByRole("alert");
  await expect(error).toBeVisible();
  await expect(error).toContainText(CONTACT_SEARCH.LONG_FAILED_SEARCH);
  expect(
    await error.evaluate(element => {
      const bounds = element.getBoundingClientRect();
      return (
        bounds.left >= 0 &&
        bounds.right <= window.innerWidth &&
        element.scrollWidth <= element.clientWidth
      );
    }),
  ).toBe(true);
  expect(
    await retry.evaluate(element => {
      const bounds = element.getBoundingClientRect();
      return bounds.left >= 0 && bounds.right <= window.innerWidth;
    }),
  ).toBe(true);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  await search.press(KEYBOARD_KEYS.TAB);
  await expect(
    dialog.getByRole("button", { name: CONTACT_SEARCH.CANCEL, exact: true }),
  ).toBeFocused();
  await page.keyboard.press(KEYBOARD_KEYS.TAB);
  await expect(retry).toBeFocused();
  responseState.failing = false;
  await retry.press(KEYBOARD_KEYS.ENTER);
  await expect(search).toBeFocused();
  await expect(page.getByRole("option").filter({ hasText: contact.name })).toBeVisible();
  await expect(page.getByRole("alert")).toHaveCount(0);
  await expect(search).toHaveValue(contact.name);
  await search.focus();
  await search.press(KEYBOARD_KEYS.ENTER);
  await expect(contactRolePicker(page, ARCHITECT)).toHaveValue(contact.name);
  await expect
    .poll(() => readRoleLinks(api, project.id))
    .toContainEqual(expect.objectContaining({ contactId: contact.id, role: ARCHITECT }));
  expect(requests.queries.every(query => query === contact.name)).toBe(true);
  requests.dispose();
});
