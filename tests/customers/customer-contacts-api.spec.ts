import { seedCustomer } from "../../src/api/seed-data.ts";
import { isRecord } from "../../src/utilities/guard.utility.ts";
import { test, expect } from "../../src/fixtures/api.fixture.ts";
import { HTTP_METHODS } from "../../src/constants/http.constant.ts";
import { USER_ROLES } from "../../src/constants/user-role.constant.ts";
import { TEST_USERS } from "../../src/constants/test-users.constant.ts";
import { contactsPath } from "../../src/utilities/apartment-import.utility.ts";

test("contact creation accepts name-only, exact duplicate reuses ID and another customer cannot edit it", async ({
  api,
}) => {
  const customer = await seedCustomer(api);
  const other = await seedCustomer(api);
  const first = await api.send(HTTP_METHODS.POST, contactsPath(customer.id), {
    name: "איש קשר ללא פרטים נוספים",
  });
  expect(first.status()).toBe(201);
  const contact: unknown = await first.json();
  if (!isRecord(contact) || typeof contact.id !== "string") {
    throw new Error("Unexpected contact response");
  }
  expect(contact).toMatchObject({ phone: null, email: null, role: null });
  const second = await api.send(HTTP_METHODS.POST, contactsPath(customer.id), {
    name: contact.name,
  });
  expect(await second.json()).toMatchObject({ id: contact.id });
  const wrongOwner = await api.send(HTTP_METHODS.PATCH, `${contactsPath(other.id)}/${contact.id}`, {
    name: "שינוי אסור",
  });
  expect(wrongOwner.status()).toBe(404);
  const updated = await api.send(HTTP_METHODS.PATCH, `${contactsPath(customer.id)}/${contact.id}`, {
    name: "שם מעודכן",
    role: "תכנון",
  });
  expect(updated.status()).toBe(200);
  expect(await updated.json()).toMatchObject({ id: contact.id, name: "שם מעודכן", role: "תכנון" });
});

test("non-admin can read contacts but cannot create or edit them", async ({ api, apiAs }) => {
  const customer = await seedCustomer(api);
  const created = await api.send(HTTP_METHODS.POST, contactsPath(customer.id), {
    name: "איש קשר מוגן",
  });
  expect(created.status()).toBe(201);
  const contact: unknown = await created.json();
  if (!isRecord(contact) || typeof contact.id !== "string") {
    throw new Error("Unexpected contact response");
  }
  const before = await api.send(HTTP_METHODS.GET, contactsPath(customer.id));
  const original: unknown = await before.json();
  const actor = await apiAs(TEST_USERS[USER_ROLES.PROJECT_MANAGER]);
  expect((await actor.send(HTTP_METHODS.GET, contactsPath(customer.id))).status()).toBe(200);
  expect(
    (await actor.send(HTTP_METHODS.POST, contactsPath(customer.id), { name: "לא מורשה" })).status(),
  ).toBe(403);
  expect(
    (
      await actor.send(HTTP_METHODS.PATCH, `${contactsPath(customer.id)}/${contact.id}`, {
        name: "שינוי אסור",
      })
    ).status(),
  ).toBe(403);
  const after = await api.send(HTTP_METHODS.GET, contactsPath(customer.id));
  expect(await after.json()).toEqual(original);
});
