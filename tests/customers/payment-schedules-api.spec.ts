import {
  saveQuotation,
  quotationWrite,
  createQuotation,
  quotationDocument,
} from "../../src/api/quotation.api.ts";

import {
  readCustomerPaymentConfiguration,
  updateCustomerPaymentConfiguration,
} from "../../src/api/customer-payment-configuration.api.ts";

import {
  CUSTOMER_PAYMENT_SCHEDULE,
  CUSTOMER_PAYMENT_FIXED_OPTIONS,
} from "../../src/constants/customer-payment-schedule.constant.ts";

import {
  readCustomerPaymentColumn,
  setLegacyCustomerOtherPayment,
} from "../../src/environment/customer-payment-schedule-fixtures.ts";

import { API_PATHS } from "../../src/constants/api.constant.ts";
import { test, expect } from "../../src/fixtures/api.fixture.ts";
import { PAYMENT_TERMS } from "../../src/constants/domain.constant.ts";
import { USER_ROLES } from "../../src/constants/user-role.constant.ts";
import { TEST_USERS } from "../../src/constants/test-users.constant.ts";
import { HTTP_METHODS, HTTP_STATUS } from "../../src/constants/http.constant.ts";
import { buildCustomerInput, seedStandaloneProject } from "../../src/api/seed-data.ts";
import { buildCustomerPath, buildQuotationPath } from "../../src/utilities/api-path.utility.ts";

test("customer payment presets and precise custom schedules persist and immediately snapshot into quotations", async ({
  api,
}) => {
  expect(await readCustomerPaymentColumn()).toEqual([{ data_type: "jsonb", is_nullable: "NO" }]);
  for (const option of CUSTOMER_PAYMENT_FIXED_OPTIONS) {
    const customer = await api.createCustomer({
      ...buildCustomerInput(),
      paymentTerms: option.value,
    });
    expect(await readCustomerPaymentConfiguration(api, customer.id)).toMatchObject({
      paymentTerms: option.value,
      paymentSchedule: [],
    });
    expect(await createQuotation(api, customer.id)).toMatchObject({
      paymentTerms: option.value,
      paymentSchedule: [],
      paymentTermsNote: "",
    });
  }
  const custom = await api.createCustomer({
    ...buildCustomerInput(),
    paymentTerms: null,
    paymentSchedule: CUSTOMER_PAYMENT_SCHEDULE.FIRST,
  });
  expect(await readCustomerPaymentConfiguration(api, custom.id)).toMatchObject({
    paymentTerms: null,
    paymentSchedule: CUSTOMER_PAYMENT_SCHEDULE.FIRST,
  });
  const quote = await createQuotation(api, custom.id);
  expect(quote).toMatchObject({
    paymentTerms: null,
    paymentSchedule: CUSTOMER_PAYMENT_SCHEDULE.FIRST,
    paymentTermsNote: "",
  });
  expect(
    await quotationDocument(await api.send(HTTP_METHODS.GET, buildQuotationPath(quote.id))),
  ).toMatchObject({
    paymentSchedule: CUSTOMER_PAYMENT_SCHEDULE.FIRST,
  });
});

test("invalid customer schedules fail atomically while quotation drafts can remain incomplete", async ({
  api,
}) => {
  const customer = await api.createCustomer(buildCustomerInput());
  const original = { paymentTerms: PAYMENT_TERMS.PREPAID, paymentSchedule: [] };
  await updateCustomerPaymentConfiguration(api, customer.id, original);
  const invalid: Record<string, unknown>[] = [
    { paymentTerms: null, paymentSchedule: [{ percent: "99.9999", text: "Incomplete total" }] },
    { paymentTerms: null, paymentSchedule: [{ percent: "100", text: " " }] },
    { paymentTerms: null, paymentSchedule: [{ percent: "100.00001", text: "Too precise" }] },
    {
      paymentTerms: null,
      paymentSchedule: [
        { percent: "-1", text: "Negative" },
        { percent: "101", text: "Over limit" },
      ],
    },
    { paymentTerms: null, paymentSchedule: [{ percent: "Infinity", text: "Not finite" }] },
    { paymentTerms: null, paymentSchedule: [{ percent: 100, text: "Wrong percentage type" }] },
    { paymentTerms: null, paymentSchedule: [{ percent: "100", text: "x".repeat(301) }] },
    {
      paymentTerms: null,
      paymentSchedule: Array.from({ length: 31 }, () => ({ percent: "0", text: "Too many" })),
    },
    {
      paymentTerms: PAYMENT_TERMS.PREPAID,
      paymentSchedule: [{ percent: "100", text: "Conflicting mode" }],
    },
    { paymentTerms: null, paymentSchedule: [{ percent: "100" }] },
    { paymentTerms: null, paymentSchedule: null },
    { paymentTerms: null, paymentSchedule: "not an array" },
    { paymentTerms: PAYMENT_TERMS.OTHER, paymentSchedule: [] },
  ];
  for (const configuration of invalid) {
    expect(
      (
        await api.send(HTTP_METHODS.POST, API_PATHS.CUSTOMER, {
          ...buildCustomerInput(),
          ...configuration,
        })
      ).status(),
    ).toBe(HTTP_STATUS.BAD_REQUEST);
    expect(
      (await api.send(HTTP_METHODS.PATCH, buildCustomerPath(customer.id), configuration)).status(),
    ).toBe(HTTP_STATUS.BAD_REQUEST);
    expect(await readCustomerPaymentConfiguration(api, customer.id)).toMatchObject(original);
  }
  const quote = await createQuotation(api, customer.id);
  const incomplete = [{ percent: "40", text: "" }];
  const draft = await saveQuotation(api, quote.id, {
    ...quotationWrite(quote),
    paymentTerms: null,
    paymentSchedule: incomplete,
  });
  expect(draft.paymentSchedule).toEqual(incomplete);
  expect(await readCustomerPaymentConfiguration(api, customer.id)).toMatchObject(original);
});

test("omitted fields preserve defaults, explicit clear works, and legacy Other remains safely unconfigured", async ({
  api,
}) => {
  const customer = await api.createCustomer({
    ...buildCustomerInput(),
    paymentTerms: null,
    paymentSchedule: CUSTOMER_PAYMENT_SCHEDULE.FIRST,
  });
  expect(
    (
      await api.send(HTTP_METHODS.PATCH, buildCustomerPath(customer.id), {
        address: "כתובת מעודכנת",
      })
    ).status(),
  ).toBe(HTTP_STATUS.OK);
  expect(await readCustomerPaymentConfiguration(api, customer.id)).toMatchObject({
    paymentTerms: null,
    paymentSchedule: CUSTOMER_PAYMENT_SCHEDULE.FIRST,
  });
  expect(
    (
      await api.send(HTTP_METHODS.PATCH, buildCustomerPath(customer.id), {
        paymentTerms: PAYMENT_TERMS.PREPAID,
      })
    ).status(),
  ).toBe(HTTP_STATUS.BAD_REQUEST);
  expect(
    await updateCustomerPaymentConfiguration(api, customer.id, {
      paymentTerms: null,
      paymentSchedule: [],
    }),
  ).toMatchObject({ paymentTerms: null, paymentSchedule: [] });
  await setLegacyCustomerOtherPayment(customer.id);
  expect(
    (
      await api.send(HTTP_METHODS.PATCH, buildCustomerPath(customer.id), {
        address: "Legacy preserved",
      })
    ).status(),
  ).toBe(HTTP_STATUS.OK);
  expect(
    (
      await api.send(HTTP_METHODS.PATCH, buildCustomerPath(customer.id), {
        paymentTerms: PAYMENT_TERMS.OTHER,
        paymentSchedule: [],
      })
    ).status(),
  ).toBe(HTTP_STATUS.OK);
  expect(await readCustomerPaymentConfiguration(api, customer.id)).toMatchObject({
    paymentTerms: PAYMENT_TERMS.OTHER,
    paymentSchedule: [],
  });
  expect(await createQuotation(api, customer.id)).toMatchObject({
    paymentTerms: null,
    paymentSchedule: [],
    paymentTermsNote: "",
  });
});

test("customer and sibling quotation schedules are independent snapshots and switching preserves manual values", async ({
  api,
}) => {
  const customer = await api.createCustomer({
    ...buildCustomerInput(),
    paymentTerms: null,
    paymentSchedule: CUSTOMER_PAYMENT_SCHEDULE.FIRST,
  });
  const replacement = await api.createCustomer({
    ...buildCustomerInput(),
    paymentTerms: PAYMENT_TERMS.PREPAID,
  });
  const first = await createQuotation(api, customer.id);
  const sibling = await createQuotation(api, customer.id);
  const overridden = await saveQuotation(api, first.id, {
    ...quotationWrite(first),
    paymentTerms: null,
    paymentSchedule: CUSTOMER_PAYMENT_SCHEDULE.QUOTE_OVERRIDE.map(stage => ({ ...stage })),
    paymentTermsNote: CUSTOMER_PAYMENT_SCHEDULE.NOTE,
  });
  await updateCustomerPaymentConfiguration(api, customer.id, {
    paymentTerms: null,
    paymentSchedule: CUSTOMER_PAYMENT_SCHEDULE.REPLACEMENT.map(stage => ({ ...stage })),
  });
  expect(await createQuotation(api, customer.id)).toMatchObject({
    paymentSchedule: CUSTOMER_PAYMENT_SCHEDULE.REPLACEMENT,
    paymentTermsNote: "",
  });
  expect(
    await quotationDocument(await api.send(HTTP_METHODS.GET, buildQuotationPath(sibling.id))),
  ).toMatchObject({ paymentSchedule: CUSTOMER_PAYMENT_SCHEDULE.FIRST, paymentTermsNote: "" });
  const replacementProject = await seedStandaloneProject(api, replacement);
  const switched = await saveQuotation(api, first.id, {
    ...quotationWrite(overridden),
    customerId: replacement.id,
    projectId: replacementProject.id,
  });
  expect(switched).toMatchObject({
    customerId: replacement.id,
    projectId: replacementProject.id,
    paymentSchedule: CUSTOMER_PAYMENT_SCHEDULE.QUOTE_OVERRIDE,
    paymentTermsNote: CUSTOMER_PAYMENT_SCHEDULE.NOTE,
  });
  expect(await readCustomerPaymentConfiguration(api, customer.id)).toMatchObject({
    paymentSchedule: CUSTOMER_PAYMENT_SCHEDULE.REPLACEMENT,
  });
  expect(await readCustomerPaymentConfiguration(api, replacement.id)).toMatchObject({
    paymentTerms: PAYMENT_TERMS.PREPAID,
    paymentSchedule: [],
  });
});

test("customer payment defaults require customer write permissions", async ({ api, apiAs }) => {
  const customer = await api.createCustomer(buildCustomerInput());
  const viewer = await apiAs(TEST_USERS[USER_ROLES.FINANCE]);
  const configuration = { paymentTerms: null, paymentSchedule: CUSTOMER_PAYMENT_SCHEDULE.FIRST };
  expect(
    (
      await viewer.send(HTTP_METHODS.POST, API_PATHS.CUSTOMER, {
        ...buildCustomerInput(),
        ...configuration,
      })
    ).status(),
  ).toBe(HTTP_STATUS.FORBIDDEN);
  expect(
    (await viewer.send(HTTP_METHODS.PATCH, buildCustomerPath(customer.id), configuration)).status(),
  ).toBe(HTTP_STATUS.FORBIDDEN);
  expect(await readCustomerPaymentConfiguration(api, customer.id)).toMatchObject({
    paymentTerms: null,
    paymentSchedule: [],
  });
});
