import { seedCustomer } from "../../src/api/seed-data.ts";
import { test, expect } from "../../src/fixtures/test.fixture.ts";
import { HTTP_METHODS } from "../../src/constants/http.constant.ts";
import { createUniqueName } from "../../src/utilities/test-data.utility.ts";
import { createProjectFormPage } from "../../src/pages/project-form.page.ts";
import { contactsPath } from "../../src/utilities/apartment-import.utility.ts";

test("new project shows existing customer contacts without capturing duplicate contact inputs", async ({
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
