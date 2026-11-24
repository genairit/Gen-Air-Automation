import { randomUUID } from "node:crypto";
import { buildCustomerInput } from "../../src/api/seed-data.ts";
import { test, expect } from "../../src/fixtures/api.fixture.ts";
import { HTTP_METHODS } from "../../src/constants/http.constant.ts";
import { customerOwnDetails } from "../../src/api/customer-own-details.api.ts";

test("customer search follows explicitly owned details without exposing directory-owned lists", async ({
  api,
}) => {
  const customer = await customerOwnDetails(
    await api.send(HTTP_METHODS.POST, "/customer", buildCustomerInput()),
  );
  const email = `owned-search-${randomUUID()}@example.test`;
  const updated = await api.send(HTTP_METHODS.PATCH, `/customer/${customer.id}`, { email });
  expect(updated.status()).toBe(200);
  const search = await api.send(
    HTTP_METHODS.GET,
    `/customer?${new URLSearchParams({ search: email })}`,
  );
  expect(search.status()).toBe(200);
  expect(await search.json()).toMatchObject({
    items: [
      expect.objectContaining({
        id: customer.id,
        primaryContact: expect.objectContaining({ email }),
      }),
    ],
  });
  const detail = await api.send(HTTP_METHODS.GET, `/customer/${customer.id}`);
  expect(await detail.json()).not.toHaveProperty("contacts");
});
