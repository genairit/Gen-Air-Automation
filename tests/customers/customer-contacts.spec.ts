import { seedCustomer } from "../../src/api/seed-data.ts";
import { test, expect } from "../../src/fixtures/test.fixture.ts";
import { createProjectFormPage } from "../../src/pages/project-form.page.ts";

test("project form shows the customer primary contact without old customer-owned controls", async ({
  page,
  api,
}) => {
  const customer = await seedCustomer(api);
  const form = createProjectFormPage(page);
  await form.goto();
  await form.customerSearch.fill(customer.name);
  await page.getByRole("option").filter({ hasText: customer.name }).click();
  await expect(page.getByText("אנשי קשר · מתוך כרטיס הלקוח", { exact: true })).toBeVisible();
  await expect(form.contactNameInput).toHaveCount(0);
  await expect(form.contactPhoneInput).toHaveCount(0);
  await expect(form.addressInput).toBeVisible();
});
