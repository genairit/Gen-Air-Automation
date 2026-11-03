import {
  saveQuotation,
  quotationWrite,
  createQuotation,
  quotationDocument,
} from "../../src/api/quotation.api.ts";

import { randomUUID } from "node:crypto";
import { API_PATHS } from "../../src/constants/api.constant.ts";
import { test, expect } from "../../src/fixtures/api.fixture.ts";
import { seedCustomer, buildCustomerInput } from "../../src/api/seed-data.ts";
import { HTTP_METHODS, HTTP_STATUS } from "../../src/constants/http.constant.ts";
import { createTestDatabaseClient } from "../../src/environment/test-database-client.ts";
import { PAYMENT_DEFAULT_OPTIONS } from "../../src/constants/payment-default.constant.ts";
import { buildCustomerPath, buildQuotationPath } from "../../src/utilities/api-path.utility.ts";

for (const paymentTerms of [null, ...PAYMENT_DEFAULT_OPTIONS.map(option => option.value)]) {
  test(`server creation immediately snapshots ${paymentTerms ?? "unset"} with an empty quote-local note`, async ({
    api,
  }) => {
    const customer = await api.createCustomer({ ...buildCustomerInput(), paymentTerms });
    const quote = await createQuotation(api, customer.id);
    expect(quote).toMatchObject({ customerId: customer.id, paymentTerms, paymentTermsNote: "" });
    const database = createTestDatabaseClient();
    await database.connect();
    try {
      const persisted = await database.query(
        "SELECT payment_terms, payment_terms_note FROM quotations WHERE id = $1",
        [quote.id],
      );
      expect(persisted.rows).toEqual([{ payment_terms: paymentTerms, payment_terms_note: "" }]);
    } finally {
      await database.end();
    }
    const reread = await quotationDocument(
      await api.send(HTTP_METHODS.GET, buildQuotationPath(quote.id)),
    );
    expect(reread).toMatchObject({ paymentTerms, paymentTermsNote: "" });
  });
}

test("customer default updates and clear affect only future quotations, never overrides or sibling quotes", async ({
  api,
}) => {
  const customer = await api.createCustomer({
    ...buildCustomerInput(),
    paymentTerms: PAYMENT_DEFAULT_OPTIONS[1].value,
  });
  const first = await createQuotation(api, customer.id);
  const sibling = await createQuotation(api, customer.id);
  const override = await saveQuotation(api, first.id, {
    ...quotationWrite(first),
    paymentTerms: PAYMENT_DEFAULT_OPTIONS[0].value,
    paymentTermsNote: "Quote-local agreement",
  });
  expect(
    await (await api.send(HTTP_METHODS.GET, buildCustomerPath(customer.id))).json(),
  ).toMatchObject({ paymentTerms: PAYMENT_DEFAULT_OPTIONS[1].value });
  for (const paymentTerms of [PAYMENT_DEFAULT_OPTIONS[2].value, null]) {
    expect(
      (
        await api.send(HTTP_METHODS.PATCH, buildCustomerPath(customer.id), { paymentTerms })
      ).status(),
    ).toBe(HTTP_STATUS.OK);
    const next = await createQuotation(api, customer.id);
    expect(next).toMatchObject({ paymentTerms, paymentTermsNote: "" });
    expect(
      await quotationDocument(await api.send(HTTP_METHODS.GET, buildQuotationPath(first.id))),
    ).toMatchObject({
      paymentTerms: override.paymentTerms,
      paymentTermsNote: override.paymentTermsNote,
    });
    expect(
      await quotationDocument(await api.send(HTTP_METHODS.GET, buildQuotationPath(sibling.id))),
    ).toMatchObject({ paymentTerms: PAYMENT_DEFAULT_OPTIONS[1].value, paymentTermsNote: "" });
  }
});

test("changing a draft customer preserves explicitly submitted terms, note and explicit null", async ({
  api,
}) => {
  const firstCustomer = await api.createCustomer({
    ...buildCustomerInput(),
    paymentTerms: PAYMENT_DEFAULT_OPTIONS[2].value,
  });
  const nextCustomer = await api.createCustomer({
    ...buildCustomerInput(),
    paymentTerms: PAYMENT_DEFAULT_OPTIONS[1].value,
  });
  const initial = await createQuotation(api, firstCustomer.id);
  const changed = await saveQuotation(api, initial.id, {
    ...quotationWrite(initial),
    customerId: nextCustomer.id,
    paymentTerms: PAYMENT_DEFAULT_OPTIONS[0].value,
    paymentTermsNote: "Explicit draft agreement",
  });
  expect(changed).toMatchObject({
    customerId: nextCustomer.id,
    paymentTerms: PAYMENT_DEFAULT_OPTIONS[0].value,
    paymentTermsNote: "Explicit draft agreement",
  });
  const cleared = await saveQuotation(api, changed.id, {
    ...quotationWrite(changed),
    customerId: firstCustomer.id,
    paymentTerms: null,
    paymentTermsNote: "",
  });
  expect(
    await quotationDocument(await api.send(HTTP_METHODS.GET, buildQuotationPath(cleared.id))),
  ).toMatchObject({ customerId: firstCustomer.id, paymentTerms: null, paymentTermsNote: "" });
  expect(
    await (await api.send(HTTP_METHODS.GET, buildCustomerPath(nextCustomer.id))).json(),
  ).toMatchObject({ paymentTerms: PAYMENT_DEFAULT_OPTIONS[1].value });
});

test("customer defaults reject invalid terms and notes; quotation creation requires a real customer", async ({
  api,
}) => {
  const customer = await seedCustomer(api);
  for (const invalid of [{ paymentTerms: "invalid" }, { paymentTermsNote: "Not customer-owned" }]) {
    expect(
      (
        await api.send(HTTP_METHODS.POST, API_PATHS.CUSTOMER, {
          ...buildCustomerInput(),
          ...invalid,
        })
      ).status(),
    ).toBe(HTTP_STATUS.BAD_REQUEST);
    expect(
      (await api.send(HTTP_METHODS.PATCH, buildCustomerPath(customer.id), invalid)).status(),
    ).toBe(HTTP_STATUS.BAD_REQUEST);
  }
  for (const input of [{}, { customerId: null }, { customerId: "invalid" }]) {
    expect((await api.send(HTTP_METHODS.POST, API_PATHS.QUOTATION, input)).status()).toBe(
      HTTP_STATUS.BAD_REQUEST,
    );
  }
  expect(
    (await api.send(HTTP_METHODS.POST, API_PATHS.QUOTATION, { customerId: randomUUID() })).status(),
  ).toBe(HTTP_STATUS.NOT_FOUND);
});
