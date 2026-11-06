import {
  PAYMENT_DEFAULT_OPTIONS,
  PAYMENT_DEFAULT_COPY as COPY,
} from "../../src/constants/payment-default.constant.ts";

import { buildCustomerInput } from "../../src/api/seed-data.ts";
import { ROUTES } from "../../src/constants/routes.constant.ts";
import { test, expect } from "../../src/fixtures/test.fixture.ts";
import { createQuotationPage } from "../../src/pages/quotation.page.ts";
import { buildCustomerRoute } from "../../src/utilities/route.utility.ts";
import { readLastPathSegment } from "../../src/utilities/route.utility.ts";
import { ROUTE_PATTERNS } from "../../src/constants/route-patterns.constant.ts";
import { HTTP_METHODS, HTTP_STATUS } from "../../src/constants/http.constant.ts";
import { quotationDocument, createQuotation } from "../../src/api/quotation.api.ts";
import { buildCustomerPath, buildQuotationPath } from "../../src/utilities/api-path.utility.ts";
import { createCustomerPaymentDefaultPage } from "../../src/pages/customer-payment-default.page.ts";

const QUOTE_NOTE = "Independent quotation payment note";

test("quotation UI keeps local override and note when customer changes; later defaults never recopy", async ({
  page,
  api,
}, testInfo) => {
  const customer = await api.createCustomer({
    ...buildCustomerInput(),
    paymentTerms: PAYMENT_DEFAULT_OPTIONS[1].value,
  });
  const replacement = await api.createCustomer({
    ...buildCustomerInput(),
    paymentTerms: PAYMENT_DEFAULT_OPTIONS[2].value,
  });
  const quote = createQuotationPage(page);
  await page.goto(ROUTES.QUOTATIONS);
  await quote.button(COPY.NEW_QUOTE).click();
  await expect(quote.button(COPY.CREATE_QUOTE)).toBeDisabled();
  await quote.chooseEntity(COPY.QUOTE_CUSTOMER, customer.name);
  await quote.button(COPY.CREATE_QUOTE).click();
  await expect(page).toHaveURL(ROUTE_PATTERNS.QUOTATION);
  const id = readLastPathSegment(page.url());
  await expect(
    page.getByRole("radio", { name: PAYMENT_DEFAULT_OPTIONS[1].label, exact: true }),
  ).toBeChecked();
  await expect(quote.field(COPY.QUOTE_NOTE)).toHaveValue("");
  await quote.saved(() =>
    page.getByRole("radio", { name: PAYMENT_DEFAULT_OPTIONS[0].label, exact: true }).click(),
  );
  await quote.fill(COPY.QUOTE_NOTE, QUOTE_NOTE);
  await quote.selectEntity(COPY.QUOTE_CUSTOMER, replacement.name);
  await page.reload();
  await expect(quote.field(COPY.QUOTE_CUSTOMER)).toHaveValue(replacement.name);
  await expect(
    page.getByRole("radio", { name: PAYMENT_DEFAULT_OPTIONS[0].label, exact: true }),
  ).toBeChecked();
  await expect(quote.field(COPY.QUOTE_NOTE)).toHaveValue(QUOTE_NOTE);
  expect(
    await quotationDocument(await api.send(HTTP_METHODS.GET, buildQuotationPath(id))),
  ).toMatchObject({
    customerId: replacement.id,
    paymentTerms: PAYMENT_DEFAULT_OPTIONS[0].value,
    paymentTermsNote: QUOTE_NOTE,
  });
  expect(
    await (await api.send(HTTP_METHODS.GET, buildCustomerPath(customer.id))).json(),
  ).toMatchObject({ paymentTerms: PAYMENT_DEFAULT_OPTIONS[1].value });
  await page.goto(buildCustomerRoute(replacement.id));
  const payment = createCustomerPaymentDefaultPage(page);
  await expect(payment.field(COPY.EDIT)).toHaveValue(PAYMENT_DEFAULT_OPTIONS[2].label);
  await payment.choose(COPY.EDIT, COPY.NONE);
  const saved = page.waitForResponse(
    response =>
      response.request().method() === HTTP_METHODS.PATCH &&
      response.url().endsWith(buildCustomerPath(replacement.id)),
  );
  await payment.saveButton.click();
  expect((await saved).status()).toBe(HTTP_STATUS.OK);
  expect(await createQuotation(api, replacement.id)).toMatchObject({
    paymentTerms: null,
    paymentTermsNote: "",
  });
  await quote.goto(id);
  await expect(
    page.getByRole("radio", { name: PAYMENT_DEFAULT_OPTIONS[0].label, exact: true }),
  ).toBeChecked();
  await expect(quote.field(COPY.QUOTE_NOTE)).toHaveValue(QUOTE_NOTE);
  await page.screenshot({
    path: testInfo.outputPath("quotation-local-payment.png"),
    fullPage: true,
  });
});
