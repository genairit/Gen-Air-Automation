import {
  createUniqueName,
  createMobilePhone,
  createUniqueEmail,
} from "../../src/utilities/test-data.utility.ts";

import { API_PATHS } from "../../src/constants/api.constant.ts";
import { buildCustomerInput } from "../../src/api/seed-data.ts";
import { isRecord } from "../../src/utilities/guard.utility.ts";
import { test, expect } from "../../src/fixtures/api.fixture.ts";
import { HTTP_METHODS } from "../../src/constants/http.constant.ts";
import { contactsPath } from "../../src/utilities/apartment-import.utility.ts";
import { CUSTOMER_SYNC_STATUSES } from "../../src/constants/domain.constant.ts";
import { archiveCustomerContacts } from "../../src/environment/contact-layout-data.ts";

test("customer list pages include active contacts without duplicating or skipping customers", async ({
  api,
}) => {
  const prefix = createUniqueName("אנשי קשר בדפדוף");
  const customers = [];
  for (const suffix of ["ראשון", "שני", "שלישי"]) {
    customers.push(
      await api.createCustomer({ ...buildCustomerInput(), name: `${prefix} ${suffix}` }),
    );
  }
  const [empty, single, multiple] = customers;
  await archiveCustomerContacts(empty.id);
  const addedName = createUniqueName("איש קשר נוסף");
  const added = await api.send(HTTP_METHODS.POST, contactsPath(multiple.id), { name: addedName });
  expect(added.status()).toBe(201);
  const contactResponse = await api.send(HTTP_METHODS.GET, contactsPath(multiple.id));
  expect(contactResponse.ok()).toBe(true);
  const multipleContacts: unknown = await contactResponse.json();
  expect(multipleContacts).toHaveLength(2);

  const query = new URLSearchParams({
    search: prefix,
    batchSize: "2",
    prioritySyncStatus: CUSTOMER_SYNC_STATUSES.PENDING,
  });
  const firstResponse = await api.send(HTTP_METHODS.GET, `${API_PATHS.CUSTOMER}?${query}`);
  expect(firstResponse.ok()).toBe(true);
  const first: unknown = await firstResponse.json();
  expect(first).toMatchObject({
    items: [
      { id: multiple.id, contacts: multipleContacts },
      { id: single.id, contacts: [expect.objectContaining({ name: single.contactName })] },
    ],
  });
  if (!isRecord(first) || typeof first.nextCursor !== "string") {
    throw new Error("First customer page must expose a continuation cursor");
  }
  query.set("batchCursor", first.nextCursor);
  const secondResponse = await api.send(HTTP_METHODS.GET, `${API_PATHS.CUSTOMER}?${query}`);
  expect(secondResponse.ok()).toBe(true);
  expect(await secondResponse.json()).toMatchObject({
    items: [{ id: empty.id, contacts: [] }],
    nextCursor: null,
  });
});

test("customer search reads current contacts and ignores retired scalar contact values", async ({
  api,
}) => {
  const retiredName = createUniqueName("איש קשר היסטורי לחיפוש");
  const retiredPhone = createMobilePhone();
  const retiredEmail = createUniqueEmail("retired.contact");
  const customer = await api.createCustomer({
    ...buildCustomerInput(),
    contactName: retiredName,
    phone: retiredPhone,
    email: retiredEmail,
  });
  const contactsResponse = await api.send(HTTP_METHODS.GET, contactsPath(customer.id));
  expect(contactsResponse.ok()).toBe(true);
  const contacts: unknown = await contactsResponse.json();
  if (!Array.isArray(contacts) || !isRecord(contacts[0]) || typeof contacts[0].id !== "string") {
    throw new Error("Customer creation must expose the initial contact");
  }
  const currentName = createUniqueName("Updated %_ contact");
  await api.createCustomer({
    ...buildCustomerInput(),
    contactName: currentName.replace("%_", "wildcard"),
  });
  const currentPhone = createMobilePhone();
  const currentEmail = createUniqueEmail("current.contact");
  const updated = await api.send(
    HTTP_METHODS.PATCH,
    `${contactsPath(customer.id)}/${contacts[0].id}`,
    {
      name: currentName,
      phone: currentPhone,
      email: currentEmail,
    },
  );
  expect(updated.ok()).toBe(true);
  const otherName = createUniqueName("איש קשר אחר");
  const other = await api.send(HTTP_METHODS.POST, contactsPath(customer.id), { name: otherName });
  expect(other.ok()).toBe(true);
  for (const search of [
    currentName,
    currentPhone,
    currentEmail.toUpperCase(),
    customer.name,
    customer.taxId,
  ]) {
    const response = await api.send(
      HTTP_METHODS.GET,
      `${API_PATHS.CUSTOMER}?${new URLSearchParams({ search })}`,
    );
    expect(response.ok()).toBe(true);
    expect(await response.json()).toMatchObject({
      items: [
        {
          id: customer.id,
          contacts: [
            expect.objectContaining({ name: currentName }),
            expect.objectContaining({ name: otherName }),
          ],
        },
      ],
    });
  }
  for (const search of [retiredName, retiredPhone, retiredEmail]) {
    const response = await api.send(
      HTTP_METHODS.GET,
      `${API_PATHS.CUSTOMER}?${new URLSearchParams({ search })}`,
    );
    expect(response.ok()).toBe(true);
    expect(await response.json()).toMatchObject({ items: [], nextCursor: null });
  }
  await archiveCustomerContacts(customer.id);
  const archived = await api.send(
    HTTP_METHODS.GET,
    `${API_PATHS.CUSTOMER}?${new URLSearchParams({ search: currentName })}`,
  );
  expect(archived.ok()).toBe(true);
  expect(await archived.json()).toMatchObject({ items: [], nextCursor: null });
});
