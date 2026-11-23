import {
  PAYMENT_DEFAULT_NONE_OPTION,
  PAYMENT_DEFAULT_COPY as COPY,
} from "../../src/constants/payment-default.constant.ts";

import {
  CUSTOMER_PAYMENT_COPY,
  CUSTOMER_PAYMENT_SCHEDULE,
  CUSTOMER_PAYMENT_FIXED_OPTIONS,
} from "../../src/constants/customer-payment-schedule.constant.ts";

import { buildCustomerInput } from "../../src/api/seed-data.ts";
import { API_PATHS } from "../../src/constants/api.constant.ts";
import { test, expect } from "../../src/fixtures/test.fixture.ts";
import { VIEWPORTS } from "../../src/constants/viewport.constant.ts";
import { PAYMENT_TERMS } from "../../src/constants/domain.constant.ts";
import { USER_ROLES } from "../../src/constants/user-role.constant.ts";
import { TEST_USERS } from "../../src/constants/test-users.constant.ts";
import { KEYBOARD_KEYS } from "../../src/constants/keyboard.constant.ts";
import { createCustomerFormPage } from "../../src/pages/customers.page.ts";
import { buildCustomerPath } from "../../src/utilities/api-path.utility.ts";
import { readHorizontalOverflow } from "../../src/pages/layout.component.ts";
import { ROUTE_PATTERNS } from "../../src/constants/route-patterns.constant.ts";
import { HTTP_METHODS, HTTP_STATUS } from "../../src/constants/http.constant.ts";
import { buildCustomerRoute, readLastPathSegment } from "../../src/utilities/route.utility.ts";
import { createCustomerPaymentDefaultPage } from "../../src/pages/customer-payment-default.page.ts";
import { readCustomerPaymentConfiguration } from "../../src/api/customer-payment-configuration.api.ts";
import { setLegacyCustomerOtherPayment } from "../../src/environment/customer-payment-schedule-fixtures.ts";

for (const option of [
  { ...PAYMENT_DEFAULT_NONE_OPTION, paymentSchedule: [] },
  { ...CUSTOMER_PAYMENT_FIXED_OPTIONS[0], paymentSchedule: [] },
  {
    value: null,
    label: CUSTOMER_PAYMENT_COPY.CUSTOM,
    paymentSchedule: CUSTOMER_PAYMENT_SCHEDULE.FIRST,
  },
]) {
  test(`customer creation persists ${option.label} using shared payment choices without a customer note`, async ({
    page,
    api,
  }) => {
    const customer = buildCustomerInput();
    const form = createCustomerFormPage(page);
    const payment = createCustomerPaymentDefaultPage(page);
    await form.goto();
    await expect(payment.choice(COPY.NONE)).toBeChecked();
    await expect(payment.choice(CUSTOMER_PAYMENT_COPY.OTHER)).toHaveCount(0);
    await payment.choose(option.label);
    if (option.paymentSchedule.length > 0) {
      await payment.fillSchedule(option.paymentSchedule);
      await payment.expectValidFields();
    }

    await expect(page.getByRole("textbox", { name: /הערה.*תשלום/ })).toHaveCount(0);
    await form.fill({
      NAME: customer.name,
      TAX_ID: customer.taxId,
      PHONE: customer.phone,
      EMAIL: customer.email,
      ADDRESS: customer.address,
      CONTACT_NAME: customer.contactName,
    });
    const creation = page.waitForResponse(
      response =>
        response.request().method() === HTTP_METHODS.POST &&
        new URL(response.url()).pathname.endsWith(API_PATHS.CUSTOMER),
    );
    await form.saveButton.click();
    expect((await creation).status()).toBe(HTTP_STATUS.CREATED);
    await form.skipProjects();
    await expect(page).toHaveURL(ROUTE_PATTERNS.CUSTOMER);
    const id = readLastPathSegment(page.url());
    await page.reload();
    await expect(payment.choice(option.label)).toBeChecked();
    expect(await readCustomerPaymentConfiguration(api, id)).toMatchObject({
      paymentTerms: option.value,
      paymentSchedule: option.paymentSchedule,
    });
  });
}

test("custom customer stages validate, survive failed save/retry and reload, and confirm destructive changes on mobile", async ({
  page,
  api,
}, testInfo) => {
  const customer = await api.createCustomer(buildCustomerInput());
  const payment = createCustomerPaymentDefaultPage(page);
  await page.setViewportSize(VIEWPORTS.MOBILE);
  await page.goto(buildCustomerRoute(customer.id));
  await payment.choice(COPY.NONE).focus();
  await page.keyboard.press(KEYBOARD_KEYS.ARROW_RIGHT);
  await expect(payment.choice(CUSTOMER_PAYMENT_COPY.CUSTOM)).toBeChecked();
  await payment.fillSchedule(CUSTOMER_PAYMENT_SCHEDULE.FIRST);
  await expect(payment.percent()).toHaveValue(CUSTOMER_PAYMENT_SCHEDULE.FIRST[0].percent);
  await expect(payment.percent(1)).toHaveValue(CUSTOMER_PAYMENT_SCHEDULE.FIRST[1].percent);
  await expect(payment.milestone()).toHaveValue(CUSTOMER_PAYMENT_SCHEDULE.FIRST[0].text);
  await payment.expectValidFields();
  await payment.percent().fill("30");
  await expect(page.getByText(CUSTOMER_PAYMENT_COPY.INVALID, { exact: true })).toBeVisible();
  await expect(payment.saveButton).toBeDisabled();
  await payment.percent().fill(CUSTOMER_PAYMENT_SCHEDULE.FIRST[0].percent);
  const route = `**${buildCustomerPath(customer.id)}`;
  const failure = { remaining: 1 };
  await page.route(route, async request => {
    const shouldFail = request.request().method() === HTTP_METHODS.PATCH && failure.remaining > 0;
    if (!shouldFail) {
      await request.continue();
      return;
    }

    failure.remaining -= 1;
    await request.fulfill({
      status: HTTP_STATUS.INTERNAL_SERVER_ERROR,
      json: { message: "Temporary payment save failure" },
    });
  });
  await payment.saveButton.click();
  await expect(page.getByRole("alert")).toBeVisible();
  await expect(payment.percent()).toHaveValue(CUSTOMER_PAYMENT_SCHEDULE.FIRST[0].percent);
  await expect(payment.milestone(1)).toHaveValue(CUSTOMER_PAYMENT_SCHEDULE.FIRST[1].text);
  await payment.expectValidFields();
  const saved = page.waitForResponse(
    response =>
      response.request().method() === HTTP_METHODS.PATCH &&
      new URL(response.url()).pathname.endsWith(buildCustomerPath(customer.id)),
  );
  await payment.saveButton.click();
  expect((await saved).status()).toBe(HTTP_STATUS.OK);
  await expect(page.getByRole("status").filter({ hasText: COPY.SAVED })).toHaveText(COPY.SAVED);
  await page.reload();
  await expect(payment.choice(CUSTOMER_PAYMENT_COPY.CUSTOM)).toBeChecked();
  await expect(payment.percent()).toHaveValue(CUSTOMER_PAYMENT_SCHEDULE.FIRST[0].percent);
  await expect(payment.milestone(1)).toHaveValue(CUSTOMER_PAYMENT_SCHEDULE.FIRST[1].text);
  await expect(page.getByText(/₪/)).toHaveCount(0);
  expect(await readHorizontalOverflow(page)).toBe(0);
  await payment.addButton.click();
  await expect(payment.percent(2)).toBeVisible();
  await payment.removeButton(2).click();
  await expect(payment.percent(2)).toHaveCount(0);
  await payment.choose(CUSTOMER_PAYMENT_FIXED_OPTIONS[0].label);
  await page.getByRole("button", { name: CUSTOMER_PAYMENT_COPY.CANCEL, exact: true }).click();
  await expect(payment.percent()).toHaveValue(CUSTOMER_PAYMENT_SCHEDULE.FIRST[0].percent);
  await payment.choose(CUSTOMER_PAYMENT_FIXED_OPTIONS[0].label);
  await expect(payment.percent()).toBeVisible();
  await page
    .getByRole("button", { name: CUSTOMER_PAYMENT_COPY.CONFIRM_PRESET, exact: true })
    .click();
  await expect(payment.percent()).toHaveCount(0);
  await payment.choose(COPY.NONE);
  await payment.saveButton.click();
  await expect(page.getByRole("status").filter({ hasText: COPY.SAVED })).toHaveText(COPY.SAVED);
  await page.reload();
  await expect(payment.choice(COPY.NONE)).toBeChecked();
  expect(await readCustomerPaymentConfiguration(api, customer.id)).toMatchObject({
    paymentTerms: null,
    paymentSchedule: [],
  });
  await page.screenshot({
    path: testInfo.outputPath("shared-customer-payment-mobile.png"),
    fullPage: true,
  });
});

test("legacy Other is visibly unconfigured while read-only viewers cannot alter defaults", async ({
  api,
  apiAs,
  openPageAs,
  page,
}) => {
  const customer = await api.createCustomer(buildCustomerInput());
  await setLegacyCustomerOtherPayment(customer.id);
  await page.goto(buildCustomerRoute(customer.id));
  await expect(page.getByText(CUSTOMER_PAYMENT_COPY.LEGACY, { exact: true })).toBeVisible();
  const credentials = TEST_USERS[USER_ROLES.FINANCE];
  const viewerPage = await openPageAs(credentials);
  await viewerPage.goto(buildCustomerRoute(customer.id));
  const payment = createCustomerPaymentDefaultPage(viewerPage);
  await expect(payment.saveButton).toHaveCount(0);
  await expect(viewerPage.getByRole("radio")).toHaveCount(
    CUSTOMER_PAYMENT_FIXED_OPTIONS.length + 2,
  );
  for (const radio of await viewerPage.getByRole("radio").all()) {
    await expect(radio).toBeDisabled();
  }
  const viewer = await apiAs(credentials);
  expect(
    (
      await viewer.send(HTTP_METHODS.PATCH, buildCustomerPath(customer.id), {
        paymentTerms: null,
        paymentSchedule: [],
      })
    ).status(),
  ).toBe(HTTP_STATUS.FORBIDDEN);
  expect(await readCustomerPaymentConfiguration(api, customer.id)).toMatchObject({
    paymentTerms: PAYMENT_TERMS.OTHER,
    paymentSchedule: [],
  });
});
