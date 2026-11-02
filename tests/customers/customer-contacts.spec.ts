import { test, expect } from "../../src/fixtures/test.fixture.ts";
import { HTTP_METHODS } from "../../src/constants/http.constant.ts";
import { createProjectPage } from "../../src/pages/project.page.ts";
import { findFieldByTitle } from "../../src/pages/field.component.ts";
import { createUniqueName } from "../../src/utilities/test-data.utility.ts";
import { createProjectFormPage } from "../../src/pages/project-form.page.ts";
import { contactsPath } from "../../src/utilities/apartment-import.utility.ts";
import { seedCustomer, seedStandaloneProject } from "../../src/api/seed-data.ts";

test("manage contact only under customer and show it on linked project without a main designation", async ({
  page,
  api,
}) => {
  const customer = await seedCustomer(api);
  const project = await seedStandaloneProject(api, customer);
  const name = createUniqueName("איש קשר נוסף");
  await page.goto(`/customers/${customer.id}`);
  await page.getByRole("button", { name: "הוספת איש קשר", exact: true }).click();
  await expect(page.getByRole("button", { name: "שמירה", exact: true })).toBeDisabled();
  const save = page.getByRole("button", { name: "שמירה", exact: true });
  const editor = save.locator("xpath=ancestor::div[.//input][1]");
  await findFieldByTitle(editor, "שם").fill(name);
  await page.getByRole("button", { name: "שמירה", exact: true }).click();
  await expect(page.getByText(name, { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByText(name, { exact: true })).toBeVisible();
  await createProjectPage(page).goto(project.id);
  await expect(page.getByText(name, { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "הוספת איש קשר", exact: true })).toHaveCount(0);
});

test("new project selects existing customer contacts instead of capturing duplicate contact inputs", async ({
  page,
  api,
}) => {
  const customer = await seedCustomer(api);
  const contactName = createUniqueName("איש קשר נבחר");
  const contact = await api.send(HTTP_METHODS.POST, contactsPath(customer.id), {
    name: contactName,
  });
  expect(contact.status()).toBe(201);
  const form = createProjectFormPage(page);
  await form.goto();
  await form.customerSearch.fill(customer.name);
  await page.getByRole("option").filter({ hasText: customer.name }).click();
  await expect(page.getByText("אנשי קשר · מתוך כרטיס הלקוח", { exact: true })).toBeVisible();
  await expect(page.getByText(contactName, { exact: true })).toBeVisible();
  await expect(form.contactNameInput).toHaveCount(0);
  await expect(form.contactPhoneInput).toHaveCount(0);
  await expect(form.addressInput).toBeVisible();
});

test("duplicate contact edit shows localized error, preserves data and clears on cancel", async ({
  page,
  api,
}) => {
  const customer = await seedCustomer(api);
  const firstName = createUniqueName("איש קשר ראשון");
  const secondName = createUniqueName("איש קשר שני");
  for (const name of [firstName, secondName]) {
    const response = await api.send(HTTP_METHODS.POST, contactsPath(customer.id), { name });
    expect(response.status()).toBe(201);
  }
  await page.goto(`/customers/${customer.id}`);
  const secondContact = page
    .getByText(secondName, { exact: true })
    .locator("xpath=ancestor::div[.//button][1]");
  await secondContact.getByRole("button", { name: "עריכה", exact: true }).click();
  const save = page.getByRole("button", { name: "שמירה", exact: true });
  const editor = save.locator("xpath=ancestor::div[.//input][1]");
  await findFieldByTitle(editor, "שם").fill(firstName);
  await save.click();
  await expect(
    editor.getByText("איש קשר עם פרטים אלה כבר קיים אצל הלקוח", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("An identical contact already exists for this customer", { exact: false }),
  ).toHaveCount(0);
  await expect(page.getByText(secondName, { exact: true })).toBeVisible();
  await editor.getByRole("button", { name: "ביטול", exact: true }).click();
  await expect(save).toHaveCount(0);
  await secondContact.getByRole("button", { name: "עריכה", exact: true }).click();
  await expect(
    editor.getByText("איש קשר עם פרטים אלה כבר קיים אצל הלקוח", { exact: true }),
  ).toHaveCount(0);
  await expect(findFieldByTitle(editor, "שם")).toHaveValue(secondName);
});
