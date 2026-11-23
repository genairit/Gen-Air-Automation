import {
  seedCustomer,
  buildCustomerInput,
  seedStandaloneProject,
} from "../../src/api/seed-data.ts";

import {
  customerOwnDetails,
  readCustomerOwnDetails,
} from "../../src/api/customer-own-details.api.ts";

import {
  readContactOwner,
  linkLegacyCustomerPrimary,
} from "../../src/environment/customer-own-details-fixtures.ts";

import { randomUUID } from "node:crypto";
import { test, expect } from "../../src/fixtures/api.fixture.ts";
import { HTTP_METHODS } from "../../src/constants/http.constant.ts";
import { USER_ROLES } from "../../src/constants/user-role.constant.ts";
import { TEST_USERS } from "../../src/constants/test-users.constant.ts";
import { PERMISSIONS } from "../../src/constants/permission.constant.ts";
import { seedRoleContact } from "../../src/api/project-contact-roles.api.ts";
import { withRolePermissions } from "../../src/environment/role-permissions.ts";
import { CUSTOMER_OWN_DETAILS as COPY } from "../../src/constants/customer-own-details.constant.ts";

const ownInput = () => ({ ...buildCustomerInput(), contactName: null });

test("customer own details accept email-only, international-phone-only and blank input without another person's name", async ({
  api,
}) => {
  const inputs = [
    { ...ownInput(), phone: null },
    { ...ownInput(), phone: COPY.PHONE_VALUE, email: null },
    { ...ownInput(), phone: null, email: null },
  ];
  for (const input of inputs) {
    const saved = await customerOwnDetails(await api.send(HTTP_METHODS.POST, "/customer", input));
    const reopened = await readCustomerOwnDetails(api, saved.id);
    expect(reopened.primaryContact).toMatchObject({
      name: input.name,
      phone: input.phone,
      email: input.email,
    });
    expect(reopened.primaryContactId).toBe(saved.primaryContactId);
    if (!saved.primaryContactId) {
      throw new Error("Expected dedicated customer details identity");
    }

    expect(await readContactOwner(saved.primaryContactId)).toBe(saved.id);
    const directory = await api.send(
      HTTP_METHODS.GET,
      `/contact-directory?search=${encodeURIComponent(input.name)}`,
    );
    expect(directory.ok()).toBe(true);
    expect(await directory.json()).not.toContainEqual(
      expect.objectContaining({ id: saved.primaryContactId }),
    );
  }
});

test("customer updates preserve omitted details, clear explicit nulls, reject invalid values and retain dedicated identity", async ({
  api,
}) => {
  const input = ownInput();
  const saved = await customerOwnDetails(await api.send(HTTP_METHODS.POST, "/customer", input));
  const email = `updated-${randomUUID()}@example.test`;
  const updated = await customerOwnDetails(
    await api.send(HTTP_METHODS.PATCH, `/customer/${saved.id}`, { email }),
  );
  expect(updated.primaryContactId).toBe(saved.primaryContactId);
  expect(updated.primaryContact).toMatchObject({ phone: input.phone, email });
  const cleared = await customerOwnDetails(
    await api.send(HTTP_METHODS.PATCH, `/customer/${saved.id}`, { phone: null }),
  );
  expect(cleared.primaryContact).toMatchObject({ phone: null, email });
  for (const changes of [{ phone: "+44123" }, { email: "not-an-email" }]) {
    expect((await api.send(HTTP_METHODS.PATCH, `/customer/${saved.id}`, changes)).status()).toBe(
      400,
    );
  }

  expect((await readCustomerOwnDetails(api, saved.id)).primaryContact).toEqual(
    cleared.primaryContact,
  );
  expect(
    (
      await api.send(HTTP_METHODS.PATCH, `/contact-directory/${saved.primaryContactId}`, {
        email: "wrong@example.test",
      })
    ).status(),
  ).toBe(400);
  expect((await readCustomerOwnDetails(api, saved.id)).primaryContact).toEqual(
    cleared.primaryContact,
  );
});

test("editing a legacy shared primary copies customer details without mutating another customer or project directory contact", async ({
  api,
}) => {
  const owner = await seedCustomer(api);
  const other = await seedCustomer(api);
  const project = await seedStandaloneProject(api, owner);
  const shared = await seedRoleContact(api);
  expect(
    (
      await api.send(HTTP_METHODS.POST, `/project/${project.id}/contacts`, {
        contactId: shared.id,
        role: null,
        isPrimary: true,
      })
    ).ok(),
  ).toBe(true);
  await linkLegacyCustomerPrimary([owner.id, other.id], shared.id);
  const before = await readCustomerOwnDetails(api, other.id);
  const email = `isolated-${randomUUID()}@example.test`;
  const updated = await customerOwnDetails(
    await api.send(HTTP_METHODS.PATCH, `/customer/${owner.id}`, { email }),
  );
  expect(updated.primaryContactId).not.toBe(shared.id);
  expect(updated.primaryContact).toMatchObject({ email, phone: shared.phone });
  expect(await readCustomerOwnDetails(api, other.id)).toEqual(before);
  const links = await api.send(HTTP_METHODS.GET, `/project/${project.id}/contacts`);
  expect(await links.json()).toContainEqual(
    expect.objectContaining({
      contactId: shared.id,
      contact: expect.objectContaining({ name: shared.name, phone: shared.phone }),
    }),
  );
  expect(await readContactOwner(updated.primaryContactId ?? "")).toBe(owner.id);
});

test("legacy explicit directory selection copies a snapshot and customer-only grants can manage own details without directory write rights", async ({
  api,
  apiAs,
}) => {
  const source = await seedRoleContact(api);
  const created = await customerOwnDetails(
    await api.send(HTTP_METHODS.POST, "/customer", {
      ...ownInput(),
      phone: null,
      email: null,
      primaryContactId: source.id,
    }),
  );
  expect(created.primaryContactId).not.toBe(source.id);
  expect(created.primaryContact).toMatchObject({ phone: source.phone, email: source.email });
  expect(
    (
      await api.send(HTTP_METHODS.PATCH, `/contact-directory/${source.id}`, {
        phone: COPY.PHONE_VALUE,
      })
    ).ok(),
  ).toBe(true);
  expect((await readCustomerOwnDetails(api, created.id)).primaryContact).toEqual(
    created.primaryContact,
  );
  await withRolePermissions(
    USER_ROLES.SECRETARY,
    [PERMISSIONS.CUSTOMERS_READ, PERMISSIONS.CUSTOMERS_CREATE, PERMISSIONS.CUSTOMERS_UPDATE],
    async () => {
      const editor = await apiAs(TEST_USERS[USER_ROLES.SECRETARY]);
      expect(
        (
          await editor.send(HTTP_METHODS.POST, "/contact-directory", {
            name: "Forbidden directory",
          })
        ).status(),
      ).toBe(403);
      const owned = await customerOwnDetails(
        await editor.send(HTTP_METHODS.POST, "/customer", ownInput()),
      );
      expect(
        (await editor.send(HTTP_METHODS.PATCH, `/customer/${owned.id}`, { email: null })).ok(),
      ).toBe(true);
    },
  );
  const viewer = await apiAs(TEST_USERS[USER_ROLES.FINANCE]);
  expect(
    (await viewer.send(HTTP_METHODS.PATCH, `/customer/${created.id}`, { email: null })).status(),
  ).toBe(403);
  expect((await readCustomerOwnDetails(api, created.id)).primaryContact).toEqual(
    created.primaryContact,
  );
});
