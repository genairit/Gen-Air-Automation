import {
  PAYMENT_DEFAULT_OPTIONS,
  PAYMENT_DEFAULT_PATTERNS,
  PAYMENT_DEFAULT_NONE_OPTION,
  PAYMENT_DEFAULT_COPY as COPY,
} from "../../src/constants/payment-default.constant.ts";

import { buildCustomerInput } from "../../src/api/seed-data.ts";
import { API_PATHS } from "../../src/constants/api.constant.ts";
import { test, expect } from "../../src/fixtures/test.fixture.ts";
import { VIEWPORTS } from "../../src/constants/viewport.constant.ts";
import { USER_ROLES } from "../../src/constants/user-role.constant.ts";
import { TEST_USERS } from "../../src/constants/test-users.constant.ts";
import { buildCustomerRoute } from "../../src/utilities/route.utility.ts";
import { createCustomerFormPage } from "../../src/pages/customers.page.ts";
import { readLastPathSegment } from "../../src/utilities/route.utility.ts";
import { buildCustomerPath } from "../../src/utilities/api-path.utility.ts";
import { readHorizontalOverflow } from "../../src/pages/layout.component.ts";
import { ROUTE_PATTERNS } from "../../src/constants/route-patterns.constant.ts";
import { HTTP_METHODS, HTTP_STATUS } from "../../src/constants/http.constant.ts";
import { createCustomerPaymentDefaultPage } from "../../src/pages/customer-payment-default.page.ts";

for (const option of [PAYMENT_DEFAULT_NONE_OPTION, PAYMENT_DEFAULT_OPTIONS[0]]) {
  test(`customer creation persists ${option.label} without any payment note`, async ({
    page,
    api,
  }, testInfo) => {
    const customer = buildCustomerInput();
    const form = createCustomerFormPage(page);
    const payment = createCustomerPaymentDefaultPage(page);

    await form.goto();
    await expect(payment.field(COPY.CREATE)).toHaveValue(COPY.NONE);
    await payment.field(COPY.CREATE).click();
    await expect(page.getByRole("option")).toHaveText([
      COPY.NONE,
      ...PAYMENT_DEFAULT_OPTIONS.map(entry => entry.label),
    ]);
    await page.getByRole("option", { name: option.label, exact: true }).click();
    await expect(page.getByRole("textbox", { name: PAYMENT_DEFAULT_PATTERNS.NOTE })).toHaveCount(0);
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
    const response = await creation;
    expect(response.status()).toBe(HTTP_STATUS.CREATED);
    const created: unknown = await response.json();
    expect(created).toMatchObject({ paymentTerms: option.value });
    expect(created).not.toHaveProperty("paymentTermsNote");
    await expect(page).toHaveURL(ROUTE_PATTERNS.CUSTOMER);
    const id = readLastPathSegment(page.url());
    await page.reload();
    await expect(payment.field(COPY.EDIT)).toHaveValue(option.label);
    const stored = await api.send(HTTP_METHODS.GET, buildCustomerPath(id));
    expect(await stored.json()).toMatchObject({ paymentTerms: option.value });
    await page.screenshot({
      path: testInfo.outputPath("customer-payment-default.png"),
      fullPage: true,
    });
  });
}

test("customer edit reuses all options and explicitly clears its default durably", async ({
  page,
  api,
}, testInfo) => {
  const customer = await api.createCustomer(buildCustomerInput());
  const payment = createCustomerPaymentDefaultPage(page);
  await page.goto(buildCustomerRoute(customer.id));
  for (const option of [...PAYMENT_DEFAULT_OPTIONS, PAYMENT_DEFAULT_NONE_OPTION]) {
    await payment.choose(COPY.EDIT, option.label);
    const saved = page.waitForResponse(
      response =>
        response.request().method() === HTTP_METHODS.PATCH &&
        new URL(response.url()).pathname.endsWith(buildCustomerPath(customer.id)),
    );
    await payment.saveButton.click();
    expect((await saved).status()).toBe(HTTP_STATUS.OK);
    await expect(page.getByRole("status")).toHaveText(COPY.SAVED);
    await page.reload();
    await expect(payment.field(COPY.EDIT)).toHaveValue(option.label);
    const stored: unknown = await (
      await api.send(HTTP_METHODS.GET, buildCustomerPath(customer.id))
    ).json();
    expect(stored).toMatchObject({ paymentTerms: option.value });
    expect(stored).not.toHaveProperty("paymentTermsNote");
  }
  await page.setViewportSize(VIEWPORTS.MOBILE);
  await expect(payment.field(COPY.EDIT)).toBeVisible();
  await expect(payment.saveButton).toBeVisible();
  expect(await readHorizontalOverflow(page)).toBe(0);
  await page.screenshot({
    path: testInfo.outputPath("customer-payment-mobile.png"),
    fullPage: true,
  });
});

test("read-only customer viewers cannot edit a default through UI or API", async ({
  api,
  apiAs,
  openPageAs,
}) => {
  const customer = await api.createCustomer(buildCustomerInput());
  const credentials = TEST_USERS[USER_ROLES.FINANCE];
  const page = await openPageAs(credentials);
  await page.goto(buildCustomerRoute(customer.id));
  const payment = createCustomerPaymentDefaultPage(page);
  await expect(payment.field(COPY.EDIT)).toBeDisabled();
  const disabledField = payment.field(COPY.EDIT).locator("xpath=../..");
  await expect(disabledField).toHaveCSS("cursor", "default");
  await disabledField.click({ position: { x: 6, y: 27 } });
  await expect(payment.field(COPY.EDIT)).toHaveAttribute("aria-expanded", "false");
  await expect(page.getByRole("option")).toHaveCount(0);
  await expect(payment.saveButton).toHaveCount(0);
  const viewer = await apiAs(credentials);
  expect(
    (
      await viewer.send(HTTP_METHODS.PATCH, buildCustomerPath(customer.id), {
        paymentTerms: PAYMENT_DEFAULT_OPTIONS[0].value,
      })
    ).status(),
  ).toBe(HTTP_STATUS.FORBIDDEN);
  expect(
    await (await api.send(HTTP_METHODS.GET, buildCustomerPath(customer.id))).json(),
  ).toMatchObject({ paymentTerms: null });
});

test("payment dropdown opens from its field edge with a pointer cursor on the first click", async ({
  page,
}) => {
  const payment = createCustomerPaymentDefaultPage(page);

  await createCustomerFormPage(page).goto();

  const field = payment.field(COPY.CREATE);
  const trigger = field.locator("xpath=../..");
  await expect(field).toHaveCSS("cursor", "pointer");
  await expect(trigger).toHaveCSS("cursor", "pointer");
  await trigger.click({ position: { x: 6, y: 27 } });
  await expect(field).toHaveAttribute("aria-expanded", "true");
  await expect(page.getByRole("option")).toHaveCount(PAYMENT_DEFAULT_OPTIONS.length + 1);
});
