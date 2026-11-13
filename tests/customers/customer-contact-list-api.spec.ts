import { buildCustomerInput } from "../../src/api/seed-data.ts";
import { isRecord } from "../../src/utilities/guard.utility.ts";
import { test, expect } from "../../src/fixtures/api.fixture.ts";
import { HTTP_METHODS } from "../../src/constants/http.constant.ts";
import { createUniqueName } from "../../src/utilities/test-data.utility.ts";

test("customer search follows the primary directory contact and does not expose customer-owned lists", async ({
  api,
}) => {
  const customer = await api.createCustomer(buildCustomerInput());
  const detailResponse = await api.send(HTTP_METHODS.GET, `/customer/${customer.id}`);
  const detail: unknown = await detailResponse.json();
  if (!isRecord(detail) || typeof detail.primaryContactId !== "string") {
    throw new Error("Customer must have a primary directory contact");
  }
  expect(detail).not.toHaveProperty("contacts");
  const name = createUniqueName("Updated directory contact");
  const updated = await api.send(
    HTTP_METHODS.PATCH,
    `/contact-directory/${detail.primaryContactId}`,
    { name },
  );
  expect(updated.status()).toBe(200);
  const search = await api.send(
    HTTP_METHODS.GET,
    `/customer?${new URLSearchParams({ search: name })}`,
  );
  expect(search.status()).toBe(200);
  expect(await search.json()).toMatchObject({
    items: [
      expect.objectContaining({
        id: customer.id,
        primaryContact: expect.objectContaining({ name }),
      }),
    ],
  });
});
