import {
  seedCustomer,
  seedBuilding,
  seedApartment,
  seedStandaloneProject,
} from "../../src/api/seed-data.ts";

import { ROUTES } from "../../src/constants/routes.constant.ts";
import { isRecord } from "../../src/utilities/guard.utility.ts";
import { test, expect } from "../../src/fixtures/test.fixture.ts";
import { findFieldByTitle } from "../../src/pages/field.component.ts";
import { USER_ROLES } from "../../src/constants/user-role.constant.ts";
import { TEST_USERS } from "../../src/constants/test-users.constant.ts";
import { PERMISSIONS } from "../../src/constants/permission.constant.ts";
import { FAKE_PLACES } from "../../src/constants/fake-places.constant.ts";
import { createUniqueName } from "../../src/utilities/test-data.utility.ts";
import { createProjectFormPage } from "../../src/pages/project-form.page.ts";
import { contactsPath } from "../../src/utilities/apartment-import.utility.ts";
import { withRolePermissions } from "../../src/environment/role-permissions.ts";
import { HTTP_METHODS, HTTP_STATUS } from "../../src/constants/http.constant.ts";
import { API_PATHS, API_PROXY_PREFIX } from "../../src/constants/api.constant.ts";
import { setIncompleteProjectContact } from "../../src/environment/contact-layout-data.ts";
import { buildApartmentRoute, buildCustomerRoute } from "../../src/utilities/route.utility.ts";
import { PROJECT_TYPE_NAMES, PAYMENT_TERMS_LABELS } from "../../src/constants/domain.constant.ts";

const CONTACT_SUMMARY = "אנשי קשר · מתוך כרטיס הלקוח";
const LEGACY_CONTACT_FIELDS = ["contactName", "contactPhone", "contactRole"] as const;

test("both project form modes use customer-owned contact chips and never submit legacy contact fields", async ({
  page,
  api,
}) => {
  const customer = await seedCustomer(api);
  const form = createProjectFormPage(page);
  await form.goto();
  const name = createUniqueName("פרויקט ללא כפילות");
  await form.fill({
    name,
    place: FAKE_PLACES[1],
    customerName: customer.name,
    projectTypeName: PROJECT_TYPE_NAMES.COMMERCIAL,
    paymentTermsLabel: PAYMENT_TERMS_LABELS.MILESTONES_NET_60,
  });
  await expect(page.getByText(CONTACT_SUMMARY, { exact: true })).toBeVisible();
  await expect(page.getByText(customer.contactName, { exact: true })).toBeVisible();
  await expect(form.contactNameInput).toHaveCount(0);
  await expect(form.contactPhoneInput).toHaveCount(0);
  await expect(page.getByPlaceholder("לדוגמה: מנהל פרויקט", { exact: true })).toHaveCount(0);
  const createRequest = page.waitForRequest(
    request => request.method() === HTTP_METHODS.POST && request.url().endsWith(API_PATHS.PROJECT),
  );
  await form.createButton.click();
  const createdPayload: unknown = (await createRequest).postDataJSON();
  for (const field of LEGACY_CONTACT_FIELDS) {
    expect(createdPayload).not.toHaveProperty(field);
  }
  await expect(page.getByRole("heading", { name, exact: true })).toBeVisible();

  const project = await seedStandaloneProject(api, customer);
  await setIncompleteProjectContact(project.id);
  await form.gotoEdit(project.id);
  await expect(form.contactNameInput).toHaveCount(0);
  await expect(form.contactPhoneInput).toHaveCount(0);
  await expect(page.getByPlaceholder("לדוגמה: מנהל פרויקט", { exact: true })).toHaveCount(0);
  await expect(page.getByText(CONTACT_SUMMARY, { exact: true })).toBeVisible();
  const editedName = createUniqueName("עריכה ללא קשר היסטורי");
  await form.nameInput.fill(editedName);
  const editRequest = page.waitForRequest(
    request =>
      request.method() === HTTP_METHODS.PATCH &&
      request.url().endsWith(`${API_PATHS.PROJECT}/${project.id}`),
  );
  await form.saveButton.click();
  const editedPayload: unknown = (await editRequest).postDataJSON();
  for (const field of LEGACY_CONTACT_FIELDS) {
    expect(editedPayload).not.toHaveProperty(field);
  }
  await expect(page.getByRole("heading", { name: editedName, exact: true })).toBeVisible();
  await expect(page.getByText("איש קשר היסטורי בפרויקט", { exact: true })).toHaveCount(0);
});

test("customer identity and compact contact editor keep valid international text and communication fields", async ({
  page,
  api,
}) => {
  const customer = await seedCustomer(api);
  await page.goto(buildCustomerRoute(customer.id));
  await expect(
    page.getByText("שדות הזהות של הלקוח. אנשי הקשר מנוהלים בכרטיס נפרד", { exact: true }),
  ).toBeVisible();
  await expect(page.getByText("איש קשר היסטורי", { exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "הוספת איש קשר", exact: true }).click();
  const save = page.getByRole("button", { name: "שמירה", exact: true });
  const editor = save.locator("xpath=ancestor::div[.//input][1]");
  const name = createUniqueName("Alex");
  await findFieldByTitle(editor, "שם").fill(name);
  await findFieldByTitle(editor, "טלפון").fill("03-1234567");
  await findFieldByTitle(editor, "דוא״ל").fill("alex@example.test");
  await findFieldByTitle(editor, "תפקיד").fill("Project manager");
  await expect(editor.getByText("יש להכניס תווים בעברית בלבד", { exact: true })).toHaveCount(0);
  await expect(save).toBeEnabled();
  await save.click();
  await expect(save).toHaveCount(0);
  const row = page.getByText(name, { exact: true }).locator("xpath=ancestor::div[.//button][1]");
  await expect(row.getByRole("link", { name: "03-1234567", exact: true })).toHaveAttribute(
    "href",
    "tel:03-1234567",
  );
  await expect(row.getByText("Project manager", { exact: true })).toBeVisible();
  await expect(row.getByText("alex@example.test", { exact: true })).toBeVisible();
  await page.screenshot({
    path: test.info().outputPath("customer-contact-layout.png"),
    fullPage: true,
  });
  await page.goto(ROUTES.CUSTOMERS);
  const search = page.getByPlaceholder("חיפוש לפי שם, ח.פ, איש קשר, טלפון או מזהה Priority...");
  await search.fill(customer.name);
  await expect(
    page
      .getByRole("row")
      .filter({ hasText: customer.name })
      .getByText(`${customer.contactName} (+1)`, { exact: true }),
  ).toBeVisible();
});

test("apartment contact preview loads real customer contacts and handles an endpoint error with retry", async ({
  page,
  api,
}) => {
  const building = await seedBuilding(api, await seedCustomer(api));
  const apartment = await seedApartment(api, building);
  const response = await api.send(HTTP_METHODS.GET, `${API_PATHS.PROJECT}/${apartment.id}`);
  const project: unknown = await response.json();
  if (!isRecord(project) || typeof project.customerId !== "string") {
    throw new Error("Seeded apartment must expose its customer ID");
  }
  const contactName = createUniqueName("קשר דירה");
  const contact = await api.send(HTTP_METHODS.POST, contactsPath(project.customerId), {
    name: contactName,
  });
  expect(contact.status()).toBe(HTTP_STATUS.CREATED);
  await page.route(`**/customer/${project.customerId}/contacts`, route =>
    route.fulfill({
      status: HTTP_STATUS.SERVICE_UNAVAILABLE,
      contentType: "application/json",
      body: JSON.stringify({ message: "temporarily unavailable" }),
    }),
  );
  await page.goto(buildApartmentRoute(building.id, apartment.id));
  await expect(page.getByRole("button", { name: "נסה שוב", exact: true })).toBeVisible();
  await page.unroute(`**/customer/${project.customerId}/contacts`);
  await page.getByRole("button", { name: "נסה שוב", exact: true }).click();
  await expect(page.getByText(contactName, { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "הוספת איש קשר", exact: true })).toHaveCount(0);
  await expect(page.getByText("איש קשר היסטורי בדירה", { exact: true })).toHaveCount(0);
});

test("apartment contact preview respects a project reader without customer-read permission", async ({
  api,
  openPageAs,
}) => {
  const building = await seedBuilding(api, await seedCustomer(api));
  const apartment = await seedApartment(api, building);
  await withRolePermissions(USER_ROLES.ENGINEER, [PERMISSIONS.PROJECTS_READ], async () => {
    const page = await openPageAs(TEST_USERS[USER_ROLES.ENGINEER]);
    const contactRequests: string[] = [];
    page.on("request", request => {
      if (
        new URL(request.url()).pathname.startsWith(`${API_PROXY_PREFIX}${API_PATHS.CUSTOMER}/`) &&
        new URL(request.url()).pathname.endsWith("/contacts")
      ) {
        contactRequests.push(request.url());
      }
    });
    await page.goto(buildApartmentRoute(building.id, apartment.id));
    await expect(page.getByText("נתונים מהפרויקט האב", { exact: true })).toBeVisible();
    await expect(page.getByText(CONTACT_SUMMARY, { exact: true })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "הוספת איש קשר", exact: true })).toHaveCount(0);
    expect(contactRequests).toEqual([]);
  });
});

test("apartment contact preview exposes loading while a real contact response is pending", async ({
  page,
  api,
}) => {
  const building = await seedBuilding(api, await seedCustomer(api));
  const apartment = await seedApartment(api, building);
  const response = await api.send(HTTP_METHODS.GET, `${API_PATHS.PROJECT}/${apartment.id}`);
  const project: unknown = await response.json();
  if (!isRecord(project) || typeof project.customerId !== "string") {
    throw new Error("Seeded apartment must expose its customer ID");
  }
  const control: { release: (() => void) | null } = { release: null };
  const pending = new Promise<void>(resolve => {
    control.release = resolve;
  });
  await page.route(`**/customer/${project.customerId}/contacts`, async route => {
    const actual = await route.fetch();
    await pending;
    await route.fulfill({ response: actual });
  });
  try {
    await page.goto(buildApartmentRoute(building.id, apartment.id));
    await expect(page.getByText("טוען אנשי קשר...", { exact: true })).toBeVisible();
    control.release?.();
    await expect(page.getByText(CONTACT_SUMMARY, { exact: true })).toBeVisible();
    await expect(page.getByText("טוען אנשי קשר...", { exact: true })).toHaveCount(0);
  } finally {
    control.release?.();
  }
});
