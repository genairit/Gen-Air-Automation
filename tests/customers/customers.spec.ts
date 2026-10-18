import {
  failNextCustomerCreation,
  CUSTOMER_CREATION_FAILURE,
} from "../../src/mocks/customer.mock.ts";

import { ROUTES } from "../../src/constants/routes.constant.ts";
import { readTabCount } from "../../src/pages/tab.component.ts";
import { test, expect } from "../../src/fixtures/test.fixture.ts";
import { buildCustomerRoute } from "../../src/utilities/route.utility.ts";
import { expectSingleResultRow } from "../../src/pages/table.component.ts";
import { seedCustomer, buildCustomerInput } from "../../src/api/seed-data.ts";
import { CUSTOMER_SYNC_STATUSES } from "../../src/constants/domain.constant.ts";
import { ROUTE_PATTERNS } from "../../src/constants/route-patterns.constant.ts";
import type { TCustomerFormInput } from "../../src/interfaces/customer-form.interface.ts";
import { CUSTOMERS_COPY, CUSTOMER_FIELD_NAMES } from "../../src/constants/copy.constant.ts";
import { createCustomersPage, createCustomerFormPage } from "../../src/pages/customers.page.ts";

const INVALID_TAX_ID = "123456789";

const toFormInput = (customer: ReturnType<typeof buildCustomerInput>): TCustomerFormInput => ({
  NAME: customer.name,
  PHONE: customer.phone,
  EMAIL: customer.email,
  TAX_ID: customer.taxId,
  ADDRESS: customer.address,
  CONTACT_NAME: customer.contactName,
});

test("create a customer through the form and land on its page", async ({ page }) => {
  const customer = buildCustomerInput();
  const formPage = createCustomerFormPage(page);

  await formPage.goto();
  await formPage.fill(toFormInput(customer));
  await formPage.saveButton.click();

  await expect(page).toHaveURL(ROUTE_PATTERNS.CUSTOMER);
  await expect(page.getByRole("heading", { name: customer.name })).toBeVisible();
  await expect(page.getByText(customer.taxId)).toBeVisible();
});

test("the customer form refuses to save with an invalid field", async ({ page }) => {
  const customer = buildCustomerInput();
  const formPage = createCustomerFormPage(page);

  await formPage.goto();
  await formPage.fill({ ...toFormInput(customer), TAX_ID: INVALID_TAX_ID });
  await formPage.saveButton.click();

  await expect(formPage.invalidMessage).toBeVisible();
  await expect(page).toHaveURL(ROUTES.NEW_CUSTOMER);
});

test("the new-customer button opens the form", async ({ page }) => {
  const customersPage = createCustomersPage(page);

  await customersPage.goto();
  await customersPage.newCustomerButton.click();

  await expect(page).toHaveURL(ROUTES.NEW_CUSTOMER);
});

test("customers list counts a new customer as pending and finds it by search", async ({
  page,
  api,
}) => {
  const customersPage = createCustomersPage(page);
  const customer = await seedCustomer(api);
  const pendingCount = await api.countCustomersInSyncStatus(CUSTOMER_SYNC_STATUSES.PENDING);

  await customersPage.goto();

  await expect.poll(() => readTabCount(customersPage.pendingTab)).toBe(pendingCount);

  await customersPage.pendingTab.click();
  await customersPage.searchBox.fill(customer.taxId);

  await expect(customersPage.findRow(customer.name)).toBeVisible();
  await expectSingleResultRow(page);
});

test("customer page shows the details and the Priority sync status", async ({ page, api }) => {
  const customer = await seedCustomer(api);
  const customersPage = createCustomersPage(page);

  await customersPage.goto();
  await customersPage.searchBox.fill(customer.taxId);
  await customersPage.findRow(customer.name).click();

  await expect(page).toHaveURL(buildCustomerRoute(customer.id));
  await expect(page.getByRole("heading", { name: customer.name })).toBeVisible();
  await expect(page.getByText(CUSTOMERS_COPY.DETAILS_TITLE)).toBeVisible();
  await expect(page.getByText(customer.contactName)).toBeVisible();
  await expect(page.getByText(CUSTOMERS_COPY.PENDING_SYNC)).not.toHaveCount(0);
});

test("a server failure preserves the customer form and retry persists the customer on its detail page", async ({
  page,
}) => {
  const customer = buildCustomerInput();
  const input = toFormInput(customer);
  const formPage = createCustomerFormPage(page);

  await formPage.goto();
  await formPage.fill(input);
  await failNextCustomerCreation(page);
  await formPage.saveButton.click();

  await expect(page.getByRole("alert")).toBeVisible();
  await expect(page.getByRole("alert")).toContainText(CUSTOMER_CREATION_FAILURE);
  await expect(page).toHaveURL(ROUTES.NEW_CUSTOMER);
  for (const name of CUSTOMER_FIELD_NAMES) {
    await expect(formPage.field(name)).toHaveValue(input[name]);
  }

  await formPage.saveButton.click();

  await expect(page).toHaveURL(ROUTE_PATTERNS.CUSTOMER);
  await expect(page.getByRole("heading", { name: customer.name })).toBeVisible();

  await page.reload();

  await expect(page).toHaveURL(ROUTE_PATTERNS.CUSTOMER);
  await expect(page.getByRole("heading", { name: customer.name })).toBeVisible();
  await expect(page.getByText(customer.taxId)).toBeVisible();
  await expect(page.getByText(customer.contactName)).toBeVisible();
  await expect(page.getByText(customer.email)).toBeVisible();
});
