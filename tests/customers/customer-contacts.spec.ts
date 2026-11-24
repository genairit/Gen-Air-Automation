import {
  PROJECT_CONTACT_ROLES,
  PROJECT_CONTACT_ROLE_COPY,
} from "../../src/constants/project-contact-role.constant.ts";

import { seedCustomer } from "../../src/api/seed-data.ts";
import { test, expect } from "../../src/fixtures/test.fixture.ts";
import { createProjectFormPage } from "../../src/pages/project-form.page.ts";
import { contactRolePicker } from "../../src/pages/project-contact-roles.page.ts";

test("project form shows the customer primary contact without old customer-owned controls", async ({
  page,
  api,
}) => {
  const customer = await seedCustomer(api);
  const form = createProjectFormPage(page);
  await form.goto();
  await form.customerSearch.fill(customer.name);
  await page.getByRole("option").filter({ hasText: customer.name }).click();
  await expect(
    page.getByText(PROJECT_CONTACT_ROLE_COPY.CREATE_SECTION, { exact: true }),
  ).toBeVisible();
  for (const role of Object.values(PROJECT_CONTACT_ROLES)) {
    await expect(contactRolePicker(page, role)).toBeVisible();
  }
  await expect(form.contactNameInput).toHaveCount(0);
  await expect(form.contactPhoneInput).toHaveCount(0);
  await expect(form.addressInput).toBeVisible();
});
