import {
  seedBuilding,
  seedCustomer,
  buildUserInput,
  buildCustomerInput,
  seedStandaloneProject,
} from "../../src/api/seed-data.ts";

import {
  createCustomerPopup,
  createCustomersPage,
  createCustomerFormPage,
} from "../../src/pages/customers.page.ts";

import type { TGenAirApi } from "../../src/api/gen-air-api.ts";
import { isRecord } from "../../src/utilities/guard.utility.ts";
import { test, expect } from "../../src/fixtures/test.fixture.ts";
import { HTTP_METHODS } from "../../src/constants/http.constant.ts";
import { findCardByTitle } from "../../src/pages/card.component.ts";
import { expectTabSelected } from "../../src/pages/tab.component.ts";
import { findFieldByTitle } from "../../src/pages/field.component.ts";
import { USER_ROLES } from "../../src/constants/user-role.constant.ts";
import { TEST_USERS } from "../../src/constants/test-users.constant.ts";
import { readLastPathSegment } from "../../src/utilities/route.utility.ts";
import { contactSearchInput } from "../../src/pages/contact-search.page.ts";
import { createUniqueName } from "../../src/utilities/test-data.utility.ts";
import { createProjectFormPage } from "../../src/pages/project-form.page.ts";
import { readCustomerProjects } from "../../src/api/customer-projects.api.ts";
import { openWorkspaceTab } from "../../src/pages/project-workspace.component.ts";
import { scopedApartmentNumber } from "../../src/utilities/apartment-fixture.utility.ts";
import { CUSTOMERS_COPY, CUSTOMER_FORM_COPY } from "../../src/constants/copy.constant.ts";

const contactIdFrom = async (response: { json: () => Promise<unknown> }): Promise<string> => {
  const body = await response.json();
  if (!isRecord(body) || typeof body.id !== "string") {
    throw new Error("Contact response has no ID");
  }
  return body.id;
};

const projectCustomerId = async (api: TGenAirApi, projectId: string) => {
  const project = await (await api.send(HTTP_METHODS.GET, `/project/${projectId}`)).json();
  if (
    !isRecord(project) ||
    (project.customerId !== null && typeof project.customerId !== "string")
  ) {
    throw new Error("Project response has no customer relation");
  }
  return project.customerId;
};

test("customer creation opens directly and saves an optional contact-free customer", async ({
  page,
  api,
}) => {
  const form = createCustomerFormPage(page);
  await form.goto();
  await expect(form.field("TAX_ID")).toBeVisible();
  await expect(form.field("TAX_ID")).toBeEmpty();
  const input = buildCustomerInput();
  await form.field("NAME").fill(input.name);
  await form.field("TAX_ID").fill(input.taxId);
  await form.field("ADDRESS").fill(input.address);
  await form.saveButton.click();
  await expect(page.getByRole("heading", { name: "שיוך פרויקטים ללקוח" })).toBeVisible();
  await page.getByRole("button", { name: "דלג", exact: true }).click();
  await expect(page.getByRole("heading", { name: input.name })).toBeVisible();
  const customerId = readLastPathSegment(page.url());
  const saved = await api.send(HTTP_METHODS.GET, `/customer/${customerId}`);
  expect(saved.status()).toBe(200);
  expect(await saved.json()).toMatchObject({
    contactName: null,
    phone: null,
    email: null,
    primaryContact: { name: input.name, phone: null, email: null },
  });
  await page.reload();
  await expect(page.getByText("פרטי קשר של הלקוח", { exact: true })).toBeVisible();
});

test("customer created from a project form returns to the caller as its selected customer", async ({
  page,
}) => {
  const projectForm = createProjectFormPage(page);
  await projectForm.goto();
  const opened = page.context().waitForEvent("page");
  await page.getByRole("link", { name: "+ לקוח חדש" }).click();
  const customerTab = await opened;
  const customerForm = createCustomerFormPage(customerTab);
  await expect(customerForm.field("TAX_ID")).toBeVisible();
  const input = buildCustomerInput();
  await customerForm.field("NAME").fill(input.name);
  await customerForm.field("TAX_ID").fill(input.taxId);
  await customerForm.field("ADDRESS").fill(input.address);
  await customerForm.saveButton.click();
  await customerForm.skipProjects();
  await expect(page.getByText(input.name, { exact: false })).toBeVisible();
  await expect(projectForm.customerSearch).toHaveCount(0);
});

test("international numbers save, reload, dial, and reject malformed values across customer, directory, and employee APIs", async ({
  page,
  api,
}) => {
  const form = createCustomerFormPage(page);
  const input = buildCustomerInput();
  await form.goto();
  await form.field("NAME").fill(input.name);
  await form.field("TAX_ID").fill(input.taxId);
  await form.field("ADDRESS").fill(input.address);
  await form.field("PHONE").fill("+44 20 7183 8750");
  await form.field("EMAIL").fill(input.email);
  await form.saveButton.click();
  await form.skipProjects();
  await expect(page.locator('a[href="tel:+442071838750"]')).toBeVisible();
  await page.reload();
  await expect(page.locator('a[href="tel:+442071838750"]')).toBeVisible();
  const customerId = readLastPathSegment(page.url());
  const saved = await api.send(HTTP_METHODS.GET, `/customer/${customerId}`);
  expect(await saved.json()).toMatchObject({
    phone: null,
    primaryContact: { phone: "+44 20 7183 8750" },
  });
  const malformed = await api.send(HTTP_METHODS.POST, "/contact-directory", {
    name: "Invalid",
    phone: "+44123",
  });
  expect(malformed.status()).toBe(400);
  const malformedCustomer = await api.send(HTTP_METHODS.POST, "/customer", {
    ...buildCustomerInput(),
    phone: "+44123",
  });
  expect(malformedCustomer.status()).toBe(400);
  const directory = await api.send(HTTP_METHODS.POST, "/contact-directory", {
    name: createUniqueName("איש קשר חוץ"),
    phone: "+12025550123",
  });
  expect(directory.status()).toBe(201);
  const contactId = await contactIdFrom(directory);
  const contacts = await api.send(HTTP_METHODS.GET, "/contact-directory?search=%2B12025550123");
  expect(JSON.stringify(await contacts.json())).toContain(contactId);
  const employee = await api.send(HTTP_METHODS.POST, "/user", {
    ...buildUserInput(USER_ROLES.ENGINEER),
    phone: "+442071838750",
  });
  expect(employee.status()).toBe(201);
  expect(await employee.json()).toMatchObject({ phone: "+442071838750" });
  const malformedEmployee = await api.send(HTTP_METHODS.POST, "/user", {
    ...buildUserInput(USER_ROLES.ENGINEER),
    phone: "+44123",
  });
  expect(malformedEmployee.status()).toBe(400);
});

test("one directory contact links to a project and apartment, then unlinking preserves the other link and customer primary", async ({
  page,
  api,
  apiAs,
}) => {
  const customer = await seedCustomer(api);
  const project = await seedStandaloneProject(api, customer);
  const building = await seedBuilding(api, customer);
  const apartment = await api.createApartment(building.id, {
    customerId: customer.id,
    customerFloor: 1,
    customerApartment: scopedApartmentNumber("77"),
  });
  const created = await api.send(HTTP_METHODS.POST, "/contact-directory", {
    name: createUniqueName("איש קשר משותף"),
    phone: "+12025550123",
  });
  expect(created.status()).toBe(201);
  const contactId = await contactIdFrom(created);
  for (const projectId of [project.id, apartment.id]) {
    const linked = await api.send(HTTP_METHODS.POST, `/project/${projectId}/contacts`, {
      contactId,
      role: "תיאום",
      isPrimary: true,
    });
    expect(linked.status()).toBe(201);
  }
  await page.goto(`/projects/${project.id}`);
  await openWorkspaceTab(page, "people");
  await expect(page.getByText("איש קשר ראשי של הפרויקט")).toBeVisible();
  await expect(page.locator('a[href="tel:+12025550123"]')).toBeVisible();
  const primary = await api.send(HTTP_METHODS.GET, `/customer/${customer.id}`);
  const primaryRecord: unknown = await primary.json();
  expect(primaryRecord).toMatchObject({ contactName: null });
  if (!isRecord(primaryRecord)) {
    throw new Error("Customer response is not an object");
  }
  expect(primaryRecord.primaryContactId).not.toBe(contactId);
  expect(
    (await api.send(HTTP_METHODS.DELETE, `/project/${project.id}/contacts/${contactId}`)).status(),
  ).toBe(204);
  expect(
    await (await api.send(HTTP_METHODS.GET, `/project/${project.id}/contacts`)).json(),
  ).toEqual([]);
  expect(
    JSON.stringify(
      await (await api.send(HTTP_METHODS.GET, `/project/${apartment.id}/contacts`)).json(),
    ),
  ).toContain(contactId);
  expect(
    JSON.stringify(
      await (await api.send(HTTP_METHODS.GET, "/contact-directory?search=%2B12025550123")).json(),
    ),
  ).toContain(contactId);
  const manager = await apiAs(TEST_USERS[USER_ROLES.PROJECT_MANAGER]);
  expect((await manager.send(HTTP_METHODS.GET, "/contact-directory")).status()).toBe(200);
  expect(
    (
      await manager.send(HTTP_METHODS.PATCH, `/contact-directory/${contactId}`, { name: "אסור" })
    ).status(),
  ).toBe(403);
});

test("project contact controls create, edit, unlink, and reselect a reusable directory entry", async ({
  page,
  api,
}) => {
  const customer = await seedCustomer(api);
  const project = await seedStandaloneProject(api, customer);
  const contactName = createUniqueName("אתר קשר");
  const editedName = `${contactName} חדש`;
  await page.goto(`/projects/${project.id}`);
  await openWorkspaceTab(page, "people");
  const card = findCardByTitle(page, "אנשי קשר בפרויקט או בדירה");
  await card.getByRole("button", { name: "צור איש קשר במדריך" }).click();
  await findFieldByTitle(card, "שם").fill(contactName);
  await findFieldByTitle(card, "טלפון").fill("+33142278186");
  await card.getByRole("button", { name: "שמירה", exact: true }).click();
  await expect(card.getByText(contactName, { exact: false })).toBeVisible();
  await expect(card.locator('a[href="tel:+33142278186"]')).toBeVisible();
  await findFieldByTitle(card, "תפקיד בפרויקט").fill("תיאום אתר");
  const roleSaved = page.waitForResponse(
    response =>
      response.request().method() === HTTP_METHODS.POST &&
      new URL(response.url()).pathname.endsWith(`/project/${project.id}/contacts`),
  );
  await card.getByRole("button", { name: "שמור תפקיד" }).click();
  expect((await roleSaved).ok()).toBe(true);
  await page.reload();
  await expect(findFieldByTitle(card, "תפקיד בפרויקט")).toHaveValue("תיאום אתר");
  await card.getByRole("button", { name: "ערוך איש קשר" }).click();
  await findFieldByTitle(card, "שם").fill(editedName);
  await card.getByRole("button", { name: "שמירה", exact: true }).click();
  await expect(card.getByText(editedName, { exact: false })).toBeVisible();
  await card.getByRole("button", { name: "הסר שיוך כאן" }).click();
  await expect(card.getByText(editedName, { exact: false })).toHaveCount(0);
  const unlinked = await api.send(HTTP_METHODS.GET, `/project/${project.id}/contacts`);
  expect(await unlinked.json()).toEqual([]);
  await contactSearchInput(card).fill(editedName);
  await expect(card.getByRole("button", { name: "שייך", exact: true })).toHaveCount(1);
  await card.getByRole("button", { name: "שייך" }).click();
  await expect(card.getByText(editedName, { exact: false })).toBeVisible();
  await page.reload();
  await expect(card.getByText(editedName, { exact: false })).toBeVisible();
});

test("filtered client list popup links only selected building and apartment, confirms reassignment, and retries a failed save", async ({
  page,
  api,
  apiAs,
}) => {
  const oldOwner = await seedCustomer(api);
  const building = await seedBuilding(api, oldOwner);
  const apartment = await api.createApartment(building.id, {
    customerId: oldOwner.id,
    customerFloor: 1,
    customerApartment: scopedApartmentNumber("88"),
  });
  const unselectedApartment = await api.createApartment(building.id, {
    customerId: oldOwner.id,
    customerFloor: 2,
    customerApartment: scopedApartmentNumber("89"),
  });
  const unrelated = await seedStandaloneProject(api, oldOwner);
  const input = buildCustomerInput();
  const list = createCustomersPage(page);
  await list.goto();
  await list.searchBox.fill(input.taxId);
  await list.pendingTab.click();
  await list.newCustomerButton.click();
  const form = createCustomerPopup(page, CUSTOMER_FORM_COPY.TITLE);
  await form.field("NAME").fill(input.name);
  await form.field("TAX_ID").fill(input.taxId);
  await form.field("ADDRESS").fill(input.address);
  await form.save.click();
  const search = page.getByPlaceholder("שם פרויקט, קוד או מספר דירה");
  await search.fill(building.name);
  await page.getByRole("checkbox", { name: `שיוך ${building.name}` }).click();
  await expect(page.getByRole("dialog", { name: "אישור שינוי שיוך פרויקט" })).toBeVisible();
  await page.getByRole("button", { name: "אשר שיוך מחדש" }).click();
  await search.fill(apartment.name);
  await page.getByRole("checkbox", { name: `שיוך ${apartment.name}` }).click();
  await page.getByRole("button", { name: "אשר שיוך מחדש" }).click();
  const failures = { remaining: 1 };
  await page.route("**/api/customer/*/projects", async route => {
    if (route.request().method() === HTTP_METHODS.POST && failures.remaining > 0) {
      failures.remaining -= 1;
      await route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({ message: "Temporary link failure" }),
      });
      return;
    }
    await route.continue();
  });
  await page.getByRole("button", { name: "שמור שיוכים" }).click();
  await expect(page.getByRole("heading", { name: "שיוך פרויקטים ללקוח" })).toBeVisible();
  await expect(page.getByRole("alert")).toBeVisible();
  await page.getByRole("button", { name: "שמור שיוכים" }).click();
  await expect(page.getByRole("dialog", { name: CUSTOMERS_COPY.LINK_PROJECTS })).toHaveCount(0);
  await expect(list.searchBox).toHaveValue(input.taxId);
  await expectTabSelected(list.pendingTab);
  await list.findRow(input.taxId).click();
  await expect(page.getByRole("heading", { name: input.name })).toBeVisible();
  const newCustomerId = readLastPathSegment(page.url());
  expect(await projectCustomerId(api, building.id)).toBe(newCustomerId);
  expect(await projectCustomerId(api, apartment.id)).toBe(newCustomerId);
  expect(await projectCustomerId(api, unselectedApartment.id)).toBe(oldOwner.id);
  expect(await projectCustomerId(api, unrelated.id)).toBe(oldOwner.id);
  expect((await readCustomerProjects(api, newCustomerId)).items.map(item => item.id)).toContain(
    building.id,
  );
  const unauthorized = await apiAs(TEST_USERS[USER_ROLES.ENGINEER]);
  expect(
    (
      await unauthorized.send(HTTP_METHODS.POST, `/customer/${newCustomerId}/projects`, {
        projects: [],
      })
    ).status(),
  ).toBe(403);
  const stale = await api.send(HTTP_METHODS.POST, `/customer/${newCustomerId}/projects`, {
    projects: [{ projectId: unrelated.id, expectedCustomerId: null }],
  });
  expect(stale.status()).toBe(409);
  expect(await projectCustomerId(api, unrelated.id)).toBe(oldOwner.id);
});
