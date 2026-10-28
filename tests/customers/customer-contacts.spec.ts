import { test, expect } from "../../src/fixtures/test.fixture.ts";
import { createProjectPage } from "../../src/pages/project.page.ts";
import { findFieldByTitle } from "../../src/pages/field.component.ts";
import { createUniqueName } from "../../src/utilities/test-data.utility.ts";
import { createProjectFormPage } from "../../src/pages/project-form.page.ts";
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
  await findFieldByTitle(page, "שם").fill(name);
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
  const form = createProjectFormPage(page);
  await form.goto();
  await form.customerSearch.fill(customer.name);
  await page.getByRole("option").filter({ hasText: customer.name }).click();
  await expect(page.getByText("אנשי הקשר של הלקוח", { exact: true })).toBeVisible();
  await expect(page.getByText(customer.contactName, { exact: true })).toBeVisible();
  await expect(form.contactNameInput).toHaveCount(0);
  await expect(form.contactPhoneInput).toHaveCount(0);
  await expect(form.addressInput).toBeVisible();
});
