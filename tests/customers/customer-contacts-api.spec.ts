import { randomUUID } from "node:crypto";
import { seedCustomer } from "../../src/api/seed-data.ts";
import { test, expect } from "../../src/fixtures/api.fixture.ts";
import { HTTP_METHODS } from "../../src/constants/http.constant.ts";
import { contactsPath } from "../../src/utilities/apartment-import.utility.ts";

test("retired customer-owned contact routes are unavailable", async ({ api }) => {
  const customer = await seedCustomer(api);
  const path = contactsPath(customer.id);
  expect((await api.send(HTTP_METHODS.GET, path)).status()).toBe(404);
  expect((await api.send(HTTP_METHODS.POST, path, { name: "Retired" })).status()).toBe(404);
  expect(
    (await api.send(HTTP_METHODS.PATCH, `${path}/${randomUUID()}`, { name: "Retired" })).status(),
  ).toBe(404);
});
