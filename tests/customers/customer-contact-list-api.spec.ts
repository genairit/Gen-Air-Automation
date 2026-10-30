import { API_PATHS } from "../../src/constants/api.constant.ts";
import { buildCustomerInput } from "../../src/api/seed-data.ts";
import { isRecord } from "../../src/utilities/guard.utility.ts";
import { test, expect } from "../../src/fixtures/api.fixture.ts";
import { HTTP_METHODS } from "../../src/constants/http.constant.ts";
import { createUniqueName } from "../../src/utilities/test-data.utility.ts";
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
