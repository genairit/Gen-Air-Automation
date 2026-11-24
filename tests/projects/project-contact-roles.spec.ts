import {
  buildProjectRoute,
  buildApartmentRoute,
  readLastPathSegment,
  buildEditProjectRoute,
} from "../../src/utilities/route.utility.ts";

import {
  readRoleLinks,
  seedRoleContact,
  contactRolePath,
} from "../../src/api/project-contact-roles.api.ts";

import {
  contactRolePicker,
  contactRoleEditor,
  selectRoleContact,
  fillRoleContactEditor,
} from "../../src/pages/project-contact-roles.page.ts";

import {
  PROJECT_CONTACT_ROLES,
  PROJECT_CONTACT_ROLE_COPY,
  PROJECT_CONTACT_ROLE_LABELS,
} from "../../src/constants/project-contact-role.constant.ts";

import { test, expect } from "../../src/fixtures/test.fixture.ts";
import { findCardByTitle } from "../../src/pages/card.component.ts";
import { HTTP_METHODS } from "../../src/constants/http.constant.ts";
import { findFieldByTitle } from "../../src/pages/field.component.ts";
import { USER_ROLES } from "../../src/constants/user-role.constant.ts";
import { TEST_USERS } from "../../src/constants/test-users.constant.ts";
import { createDeferred } from "../../src/utilities/deferred.utility.ts";
import { FAKE_PLACES } from "../../src/constants/fake-places.constant.ts";
import { PROJECT_TYPE_NAMES } from "../../src/constants/domain.constant.ts";
import { createUniqueName } from "../../src/utilities/test-data.utility.ts";
import { createProjectFormPage } from "../../src/pages/project-form.page.ts";
import { createApartmentDesignPage } from "../../src/pages/apartment-design.page.ts";
import { createApartmentNumber } from "../../src/utilities/apartment-fixture.utility.ts";
import { seedBuilding, seedCustomer, seedStandaloneProject } from "../../src/api/seed-data.ts";

const ROLES = Object.values(PROJECT_CONTACT_ROLES);

test("new project always shows three optional roles and persists existing directory selections", async ({
  page,
  api,
}) => {
  const owner = await seedCustomer(api);
  const contact = await seedRoleContact(api);
  const form = createProjectFormPage(page);
  await form.goto();
  for (const role of ROLES) {
    await expect(contactRolePicker(page, role)).toBeVisible();
  }
  await form.fill({
    name: createUniqueName("פרויקט עם תפקידים"),
    place: FAKE_PLACES[1],
    customerName: owner.name,
    projectTypeName: PROJECT_TYPE_NAMES.COMMERCIAL,
  });
  await selectRoleContact(page, PROJECT_CONTACT_ROLES.ARCHITECT, contact.name);
  await form.createButton.click();
  await expect(page).toHaveURL(/\/projects\/[0-9a-f-]{36}$/);
  const projectId = readLastPathSegment(page.url());
  expect(await readRoleLinks(api, projectId)).toContainEqual(
    expect.objectContaining({ contactId: contact.id, role: PROJECT_CONTACT_ROLES.ARCHITECT }),
  );
  await page.reload();
  await expect(contactRolePicker(page, PROJECT_CONTACT_ROLES.ARCHITECT)).toHaveValue(contact.name);
});

test("edit replaces and clears a role while keeping the displaced additional contact and other project usage", async ({
  page,
  api,
}) => {
  const owner = await seedCustomer(api);
  const project = await seedStandaloneProject(api, owner);
  const other = await seedStandaloneProject(api, owner);
  const first = await seedRoleContact(api);
  const second = await seedRoleContact(api);
  for (const id of [project.id, other.id]) {
    expect(
      (
        await api.send(HTTP_METHODS.PUT, contactRolePath(id, PROJECT_CONTACT_ROLES.CONSULTANT), {
          contactId: first.id,
        })
      ).ok(),
    ).toBe(true);
  }
  await page.goto(buildEditProjectRoute(project.id));
  await expect(contactRolePicker(page, PROJECT_CONTACT_ROLES.CONSULTANT)).toHaveValue(first.name);
  await selectRoleContact(page, PROJECT_CONTACT_ROLES.CONSULTANT, second.name);
  await expect
    .poll(() => readRoleLinks(api, project.id))
    .toContainEqual(
      expect.objectContaining({ contactId: second.id, role: PROJECT_CONTACT_ROLES.CONSULTANT }),
    );
  await page.reload();
  await expect(contactRolePicker(page, PROJECT_CONTACT_ROLES.CONSULTANT)).toHaveValue(second.name);
  await page.getByRole("button", { name: "הסר מהתפקיד יועץ", exact: true }).click();
  await expect(contactRolePicker(page, PROJECT_CONTACT_ROLES.CONSULTANT)).toHaveValue("");
  expect(
    (await readRoleLinks(api, project.id)).some(
      link => link.role === PROJECT_CONTACT_ROLES.CONSULTANT,
    ),
  ).toBe(false);
  expect(await readRoleLinks(api, other.id)).toContainEqual(
    expect.objectContaining({ contactId: first.id, role: PROJECT_CONTACT_ROLES.CONSULTANT }),
  );
  await expect(
    findCardByTitle(page, PROJECT_CONTACT_ROLE_COPY.SECTION).getByText(first.name, {
      exact: false,
    }),
  ).toBeVisible();
});

test("inline contact creation recovers after a failed role assignment without duplicating or discarding edited details", async ({
  page,
  api,
}) => {
  const project = await seedStandaloneProject(api, await seedCustomer(api));
  const attempts = { assign: 0, create: 0 };
  page.on("request", request => {
    if (request.method() === HTTP_METHODS.POST && request.url().endsWith("/contact-directory")) {
      attempts.create += 1;
    }
  });
  await page.route(
    `**${contactRolePath(project.id, PROJECT_CONTACT_ROLES.ARCHITECT)}`,
    async route => {
      attempts.assign += 1;
      if (attempts.assign === 1) {
        await route.fulfill({
          status: 503,
          contentType: "application/json",
          body: JSON.stringify({ message: "Temporary role save failure" }),
        });
        return;
      }
      await route.continue();
    },
  );
  await page.goto(buildProjectRoute(project.id));
  await page.getByRole("button", { name: "הוסף אדריכל", exact: true }).click();
  const name = createUniqueName("אדריכל חדש");
  const save = await fillRoleContactEditor(page, PROJECT_CONTACT_ROLES.ARCHITECT, name);
  await save.click();
  const editor = contactRoleEditor(page, PROJECT_CONTACT_ROLES.ARCHITECT);
  await expect(editor.getByRole("alert").first()).toBeVisible();
  const updated = name + " מעודכן";
  await findFieldByTitle(editor, "שם").fill(updated);
  await save.click();
  await expect(contactRolePicker(page, PROJECT_CONTACT_ROLES.ARCHITECT)).toHaveValue(updated);
  await page.reload();
  await expect(contactRolePicker(page, PROJECT_CONTACT_ROLES.ARCHITECT)).toHaveValue(updated);
  expect(attempts.create).toBe(1);
  expect(await readRoleLinks(api, project.id)).toContainEqual(
    expect.objectContaining({
      role: PROJECT_CONTACT_ROLES.ARCHITECT,
      contact: expect.objectContaining({ name: updated }),
    }),
  );
});

test("editing a shared role contact shows the warning and retains its role after reload", async ({
  page,
  api,
}) => {
  const contact = await seedRoleContact(api);
  const owner = await seedCustomer(api);
  const project = await seedStandaloneProject(api, owner);
  const other = await seedStandaloneProject(api, owner);
  for (const id of [project.id, other.id]) {
    expect(
      (
        await api.send(
          HTTP_METHODS.PUT,
          contactRolePath(id, PROJECT_CONTACT_ROLES.PROJECT_MANAGER),
          { contactId: contact.id },
        )
      ).ok(),
    ).toBe(true);
  }
  await page.goto(buildProjectRoute(project.id));
  await page.getByRole("button", { name: "ערוך פרטי מנהל פרויקט", exact: true }).click();
  await expect(
    page.getByText(PROJECT_CONTACT_ROLE_COPY.SHARED_EDIT, { exact: true }),
  ).toBeVisible();
  const name = contact.name + " מתוקן";
  const save = await fillRoleContactEditor(page, PROJECT_CONTACT_ROLES.PROJECT_MANAGER, name);
  await save.click();
  await expect(contactRolePicker(page, PROJECT_CONTACT_ROLES.PROJECT_MANAGER)).toHaveValue(name);
  await page.reload();
  await expect(contactRolePicker(page, PROJECT_CONTACT_ROLES.PROJECT_MANAGER)).toHaveValue(name);
  expect(await readRoleLinks(api, other.id)).toContainEqual(
    expect.objectContaining({
      contactId: contact.id,
      role: PROJECT_CONTACT_ROLES.PROJECT_MANAGER,
      contact: expect.objectContaining({ name }),
    }),
  );
});

test("apartment creation exposes optional roles and persists the chosen consultant", async ({
  page,
  api,
}) => {
  const owner = await seedCustomer(api);
  const building = await seedBuilding(api, owner);
  const contact = await seedRoleContact(api);
  const form = createApartmentDesignPage(page);
  await form.gotoCreate(building.id);
  for (const role of ROLES) {
    await expect(contactRolePicker(page, role)).toBeVisible();
  }
  await form.fillUnit(createApartmentNumber());
  await form.pickCustomer(owner.name);
  await selectRoleContact(page, PROJECT_CONTACT_ROLES.CONSULTANT, contact.name);
  const responsePromise = page.waitForResponse(
    response =>
      response.request().method() === HTTP_METHODS.POST &&
      response.url().endsWith(`/project/${building.id}/apartments`),
  );
  await form.submit.click();
  const response = await responsePromise;
  expect(response.ok()).toBe(true);
  const body: unknown = await response.json();
  if (typeof body !== "object" || body === null || !("id" in body) || typeof body.id !== "string") {
    throw new Error("Apartment response missing identity");
  }
  expect(await readRoleLinks(api, body.id)).toContainEqual(
    expect.objectContaining({ contactId: contact.id, role: PROJECT_CONTACT_ROLES.CONSULTANT }),
  );
  await page.goto(buildApartmentRoute(building.id, body.id));
  await expect(contactRolePicker(page, PROJECT_CONTACT_ROLES.CONSULTANT)).toHaveValue(contact.name);
});

test("read-only mobile view displays empty and populated roles with isolated contact links", async ({
  api,
  openPageAs,
}, testInfo) => {
  const project = await seedStandaloneProject(api, await seedCustomer(api));
  const page = await openPageAs(TEST_USERS[USER_ROLES.INSTALLER]);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(buildProjectRoute(project.id));
  const section = findCardByTitle(page, PROJECT_CONTACT_ROLE_COPY.SECTION);
  for (const role of ROLES) {
    await expect(
      section.getByText(PROJECT_CONTACT_ROLE_LABELS[role], { exact: true }),
    ).toBeVisible();
  }
  await expect(section.getByText(PROJECT_CONTACT_ROLE_COPY.EMPTY, { exact: true })).toHaveCount(
    ROLES.length,
  );
  await expect(section.getByRole("combobox")).toHaveCount(0);
  await expect(section.getByRole("button")).toHaveCount(0);
  const contact = await seedRoleContact(api);
  expect(
    (
      await api.send(
        HTTP_METHODS.PUT,
        contactRolePath(project.id, PROJECT_CONTACT_ROLES.ARCHITECT),
        { contactId: contact.id },
      )
    ).ok(),
  ).toBe(true);
  await page.reload();
  await expect(section.getByText(contact.name, { exact: true })).toBeVisible();
  const phone = section.getByRole("link", { name: contact.phone, exact: true });
  const email = section.getByRole("link", { name: contact.email, exact: true });
  await expect(phone).toHaveAttribute("href", `tel:${contact.phone}`);
  await expect(email).toHaveAttribute("href", `mailto:${contact.email}`);
  await expect(phone).toHaveAttribute("dir", "ltr");
  await expect(email).toHaveAttribute("dir", "ltr");
  await expect(section.getByText(PROJECT_CONTACT_ROLE_COPY.EMPTY, { exact: true })).toHaveCount(
    ROLES.length - 1,
  );
  await testInfo.attach("readonly-contact-roles-mobile", {
    body: await page.screenshot({ fullPage: true }),
    contentType: "image/png",
  });

  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
});

test("project submission waits for an in-flight inline contact save", async ({ page, api }) => {
  const owner = await seedCustomer(api);
  const form = createProjectFormPage(page);
  await form.goto();
  await form.fill({
    name: createUniqueName("שמירת תפקיד לפני פרויקט"),
    place: FAKE_PLACES[1],
    customerName: owner.name,
    projectTypeName: PROJECT_TYPE_NAMES.COMMERCIAL,
  });
  await expect(form.createButton).toBeEnabled();
  const intercepted = createDeferred();
  const resume = createDeferred();
  await page.route("**/contact-directory", async route => {
    if (route.request().method() !== HTTP_METHODS.POST) {
      await route.continue();
      return;
    }
    intercepted.resolve();
    await resume.promise;
    await route.continue();
  });
  await page.getByRole("button", { name: "הוסף אדריכל", exact: true }).click();
  const name = createUniqueName("אדריכל בזמן שמירה");
  const save = await fillRoleContactEditor(page, PROJECT_CONTACT_ROLES.ARCHITECT, name);
  await save.click();
  try {
    await intercepted.promise;
    await expect(form.createButton).toBeDisabled();
  } finally {
    resume.resolve();
  }
  await expect(contactRolePicker(page, PROJECT_CONTACT_ROLES.ARCHITECT)).toHaveValue(name);
  await expect(form.createButton).toBeEnabled();
  await form.createButton.click();
  await expect(page).toHaveURL(/\/projects\/[0-9a-f-]{36}$/);
  expect(await readRoleLinks(api, readLastPathSegment(page.url()))).toContainEqual(
    expect.objectContaining({
      role: PROJECT_CONTACT_ROLES.ARCHITECT,
      contact: expect.objectContaining({ name }),
    }),
  );
});
