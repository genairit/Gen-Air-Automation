import {
  readCustomerPaymentConfiguration,
  updateCustomerPaymentConfiguration,
} from "../../src/api/customer-payment-configuration.api.ts";

import {
  CUSTOMER_PAYMENT_COPY,
  CUSTOMER_PAYMENT_SCHEDULE,
} from "../../src/constants/customer-payment-schedule.constant.ts";

import { buildCustomerInput } from "../../src/api/seed-data.ts";
import { ROUTES } from "../../src/constants/routes.constant.ts";
import { test, expect } from "../../src/fixtures/test.fixture.ts";
import { PAYMENT_TERMS } from "../../src/constants/domain.constant.ts";
import { createQuotationPage } from "../../src/pages/quotation.page.ts";
import { createDeferred } from "../../src/utilities/deferred.utility.ts";
import { readLastPathSegment } from "../../src/utilities/route.utility.ts";
import { ROUTE_PATTERNS } from "../../src/constants/route-patterns.constant.ts";
import { HTTP_METHODS, HTTP_STATUS } from "../../src/constants/http.constant.ts";
import { quotationDocument, createQuotation } from "../../src/api/quotation.api.ts";
import { PAYMENT_DEFAULT_COPY as COPY } from "../../src/constants/payment-default.constant.ts";
import { buildCustomerPath, buildQuotationPath } from "../../src/utilities/api-path.utility.ts";
import { createCustomerPaymentDefaultPage } from "../../src/pages/customer-payment-default.page.ts";

test("quotation copies customer custom stages, protects local overrides on customer switch, and explicitly applies only the selected default", async ({
  page,
  api,
}, testInfo) => {
  const customer = await api.createCustomer({
    ...buildCustomerInput(),
    paymentTerms: null,
    paymentSchedule: CUSTOMER_PAYMENT_SCHEDULE.FIRST,
  });
  const replacement = await api.createCustomer({
    ...buildCustomerInput(),
    paymentTerms: null,
    paymentSchedule: CUSTOMER_PAYMENT_SCHEDULE.REPLACEMENT,
  });
  const unset = await api.createCustomer(buildCustomerInput());
  const quote = createQuotationPage(page);
  const payment = createCustomerPaymentDefaultPage(page);
  await page.goto(ROUTES.QUOTATIONS);
  await quote.button(COPY.NEW_QUOTE).click();
  await quote.chooseEntity(COPY.QUOTE_CUSTOMER, customer.name);
  await quote.button(COPY.CREATE_QUOTE).click();
  await expect(page).toHaveURL(ROUTE_PATTERNS.QUOTATION);
  const id = readLastPathSegment(page.url());
  await expect(payment.percent()).toHaveValue(CUSTOMER_PAYMENT_SCHEDULE.FIRST[0].percent);
  await expect(payment.milestone(1)).toHaveValue(CUSTOMER_PAYMENT_SCHEDULE.FIRST[1].text);
  await quote.fill(COPY.QUOTE_NOTE, CUSTOMER_PAYMENT_SCHEDULE.NOTE);
  await quote.saved(() => payment.percent().fill("30"));
  await quote.saved(() => payment.percent(1).fill("70"));
  await quote.selectEntity(COPY.QUOTE_CUSTOMER, replacement.name);
  await expect(payment.percent()).toHaveValue("30");
  await expect(payment.percent(1)).toHaveValue("70");
  await expect(quote.field(COPY.QUOTE_NOTE)).toHaveValue(CUSTOMER_PAYMENT_SCHEDULE.NOTE);
  const apply = quote.button(CUSTOMER_PAYMENT_COPY.APPLY);
  await expect(apply).toBeEnabled();
  await quote.saved(() => apply.click());
  await page.reload();
  await expect(payment.percent()).toHaveValue(CUSTOMER_PAYMENT_SCHEDULE.REPLACEMENT[0].percent);
  await expect(payment.milestone(1)).toHaveValue(CUSTOMER_PAYMENT_SCHEDULE.REPLACEMENT[1].text);
  await expect(quote.field(COPY.QUOTE_NOTE)).toHaveValue(CUSTOMER_PAYMENT_SCHEDULE.NOTE);
  expect(
    await quotationDocument(await api.send(HTTP_METHODS.GET, buildQuotationPath(id))),
  ).toMatchObject({
    customerId: replacement.id,
    paymentTerms: null,
    paymentSchedule: CUSTOMER_PAYMENT_SCHEDULE.REPLACEMENT,
    paymentTermsNote: CUSTOMER_PAYMENT_SCHEDULE.NOTE,
  });
  expect(await readCustomerPaymentConfiguration(api, customer.id)).toMatchObject({
    paymentSchedule: CUSTOMER_PAYMENT_SCHEDULE.FIRST,
  });
  await updateCustomerPaymentConfiguration(api, replacement.id, {
    paymentTerms: PAYMENT_TERMS.PREPAID,
    paymentSchedule: [],
  });
  await page.reload();
  await expect(payment.percent()).toHaveValue(CUSTOMER_PAYMENT_SCHEDULE.REPLACEMENT[0].percent);
  await quote.selectEntity(COPY.QUOTE_CUSTOMER, unset.name);
  await expect(page.getByText(CUSTOMER_PAYMENT_COPY.NO_DEFAULT, { exact: true })).toBeVisible();
  await expect(apply).toHaveCount(0);
  await expect(payment.percent()).toHaveValue(CUSTOMER_PAYMENT_SCHEDULE.REPLACEMENT[0].percent);
  await expect(quote.field(COPY.QUOTE_NOTE)).toHaveValue(CUSTOMER_PAYMENT_SCHEDULE.NOTE);
  await page.screenshot({
    path: testInfo.outputPath("quotation-customer-default-protection.png"),
    fullPage: true,
  });
});

test("failed and stale customer-default responses cannot replace quotation stages for the current customer", async ({
  page,
  api,
}) => {
  const first = await api.createCustomer({
    ...buildCustomerInput(),
    paymentTerms: null,
    paymentSchedule: CUSTOMER_PAYMENT_SCHEDULE.FIRST,
  });
  const slow = await api.createCustomer({
    ...buildCustomerInput(),
    paymentTerms: PAYMENT_TERMS.PREPAID,
  });
  const current = await api.createCustomer({
    ...buildCustomerInput(),
    paymentTerms: null,
    paymentSchedule: CUSTOMER_PAYMENT_SCHEDULE.REPLACEMENT,
  });
  const initial = await createQuotation(api, first.id);
  const quote = createQuotationPage(page);
  const payment = createCustomerPaymentDefaultPage(page);
  const started = createDeferred();
  const release = createDeferred();
  const completed = createDeferred();
  const failure = { active: true };
  await page.route(`**${buildCustomerPath(slow.id)}`, async route => {
    const response = await route.fetch();
    started.resolve();
    await release.promise;
    await route.fulfill({ response });
    completed.resolve();
  });
  await page.route(`**${buildCustomerPath(current.id)}`, async route => {
    if (failure.active) {
      await route.fulfill({
        status: HTTP_STATUS.SERVICE_UNAVAILABLE,
        json: { message: "Temporary default lookup failure" },
      });
      return;
    }

    await route.continue();
  });
  try {
    await quote.goto(initial.id);
    await quote.selectEntity(COPY.QUOTE_CUSTOMER, slow.name);
    await started.promise;
    await expect(quote.button(CUSTOMER_PAYMENT_COPY.APPLY)).toHaveCount(0);
    const selectionSaved = page.waitForResponse(
      response =>
        response.request().method() === HTTP_METHODS.PUT &&
        new URL(response.url()).pathname.endsWith(buildQuotationPath(initial.id)),
    );
    await quote.chooseEntity(COPY.QUOTE_CUSTOMER, current.name);
    expect((await selectionSaved).status()).toBe(HTTP_STATUS.OK);
    await expect(quote.button(CUSTOMER_PAYMENT_COPY.RETRY)).toBeVisible();
    release.resolve();
    await completed.promise;
    await expect(quote.field(COPY.QUOTE_CUSTOMER)).toHaveValue(current.name);
    await expect(quote.button(CUSTOMER_PAYMENT_COPY.APPLY)).toHaveCount(0);
    await expect(payment.percent()).toHaveValue(CUSTOMER_PAYMENT_SCHEDULE.FIRST[0].percent);
    failure.active = false;
    await quote.button(CUSTOMER_PAYMENT_COPY.RETRY).click();
    await expect(quote.button(CUSTOMER_PAYMENT_COPY.APPLY)).toBeEnabled();
    await quote.saved(() => quote.button(CUSTOMER_PAYMENT_COPY.APPLY).click());
    await expect(payment.percent()).toHaveValue(CUSTOMER_PAYMENT_SCHEDULE.REPLACEMENT[0].percent);
    expect(
      await quotationDocument(await api.send(HTTP_METHODS.GET, buildQuotationPath(initial.id))),
    ).toMatchObject({
      customerId: current.id,
      paymentTerms: null,
      paymentSchedule: CUSTOMER_PAYMENT_SCHEDULE.REPLACEMENT,
    });
  } finally {
    release.resolve();
    await page.unrouteAll({ behavior: "wait" });
  }
});
