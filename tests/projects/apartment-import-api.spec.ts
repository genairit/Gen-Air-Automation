import {
  importPath,
  contactsPath,
  buildImportRow,
  makeImportWorkbook,
  readImportWorkbook,
} from "../../src/utilities/apartment-import.utility.ts";

import { test, expect } from "../../src/fixtures/api.fixture.ts";
import { HTTP_METHODS } from "../../src/constants/http.constant.ts";
import { TEST_USERS } from "../../src/constants/test-users.constant.ts";
import { APARTMENT_IMPORT } from "../../src/constants/apartment-import.constant.ts";
import { USER_ROLES, USER_ROLE_VALUES } from "../../src/constants/user-role.constant.ts";
import { seedBuilding, seedCustomer, buildCustomerInput } from "../../src/api/seed-data.ts";
import { uploadApartments, readBuildingApartments } from "../../src/api/apartment-import.api.ts";

test("template has exactly13Hebrew columns and no building column", async ({ api }) => {
  const building = await seedBuilding(api, await seedCustomer(api));
  const response = await api.download(`${importPath(building.id)}/template`);
  expect(response.ok()).toBe(true);
  const workbook = await readImportWorkbook(await response.body());
  const sheet = workbook.getWorksheet(APARTMENT_IMPORT.SHEET);
  expect(sheet?.columnCount).toBe(13);
  expect(
    APARTMENT_IMPORT.HEADERS.map((_, index) => sheet?.getRow(1).getCell(index + 1).value),
  ).toEqual(APARTMENT_IMPORT.HEADERS);
});

test("partial import persists two customer-owned contacts, exact credit and add-only reimport", async ({
  api,
}) => {
  const building = await seedBuilding(api, await seedCustomer(api));
  const customer = buildCustomerInput();
  const row = buildImportRow(customer, "003א");
  const invalid = buildImportRow(buildCustomerInput(), "4");
  invalid[9] = "-1";
  const result = await uploadApartments(api, building.id, [row, row, invalid]);
  expect(result.counts).toEqual({ created: 1, existing: 0, duplicate: 1, error: 1 });
  const apartments = await readBuildingApartments(api, building.id);
  expect(apartments).toHaveLength(1);
  expect(apartments[0]).toMatchObject({
    customerApartment: "003א",
    apartmentOwnership: "buyer",
    apartmentCredit: "120.50",
  });
  const contacts = await api.send(HTTP_METHODS.GET, contactsPath(apartments[0].customerId));
  expect(await contacts.json()).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        name: customer.name,
        phone: customer.phone,
        email: customer.email,
      }),
      expect.objectContaining({
        name: APARTMENT_IMPORT.CONTACT_NAME,
        phone: APARTMENT_IMPORT.CONTACT_PHONE,
        email: APARTMENT_IMPORT.CONTACT_EMAIL,
      }),
    ]),
  );
  expect(await contacts.json()).toHaveLength(2);
  expect((await uploadApartments(api, building.id, [row])).counts).toEqual({
    created: 0,
    existing: 1,
    duplicate: 0,
    error: 0,
  });
  expect(await readBuildingApartments(api, building.id)).toEqual(apartments);
  expect(result.reportBase64).not.toBeNull();
  const report = await readImportWorkbook(Buffer.from(result.reportBase64 ?? "", "base64"));
  const reportSheet = report.getWorksheet(APARTMENT_IMPORT.SHEET);
  expect(reportSheet?.columnCount).toBe(14);
  expect(reportSheet?.rowCount).toBe(3);
  expect(
    [...APARTMENT_IMPORT.HEADERS, APARTMENT_IMPORT.ERROR_HEADER].map(
      (_, index) => reportSheet?.getRow(1).getCell(index + 1).value,
    ),
  ).toEqual([...APARTMENT_IMPORT.HEADERS, APARTMENT_IMPORT.ERROR_HEADER]);
  for (const [index, original] of [row, invalid].entries()) {
    const reportRow = reportSheet?.getRow(index + 2);
    expect(original.map((_, cell) => reportRow?.getCell(cell + 1).value)).toEqual(original);
    expect(reportRow?.getCell(14).value).toEqual(expect.stringMatching(/\S/));
  }
});

test("existing taxID mismatch and repeated file identity conflicts create no apartments", async ({
  api,
}) => {
  const building = await seedBuilding(api, await seedCustomer(api));
  const customer = buildCustomerInput();
  await api.createCustomer(customer);
  const wrong = buildImportRow({ ...customer, name: "שם אחר" });
  expect((await uploadApartments(api, building.id, [wrong])).counts.error).toBe(1);
  expect(await readBuildingApartments(api, building.id)).toEqual([]);
  const newCustomer = buildCustomerInput();
  const first = buildImportRow(newCustomer);
  first[9] = "-1";
  const second = buildImportRow({ ...newCustomer, name: "פרטים שונים" }, "2");
  expect((await uploadApartments(api, building.id, [first, second])).counts.error).toBe(2);
  const lookup = await api.send(HTTP_METHODS.GET, `/customer?search=${newCustomer.taxId}`);
  expect(await lookup.json()).toMatchObject({ items: [] });
});

test("contact validation failure rolls back apartment and added contacts for that row", async ({
  api,
}) => {
  const building = await seedBuilding(api, await seedCustomer(api));
  const input = buildCustomerInput();
  const customer = await api.createCustomer(input);
  const before = await api.send(HTTP_METHODS.GET, contactsPath(customer.id));
  const original: unknown = await before.json();
  const row = buildImportRow(input);
  row[6] = "א";
  const result = await uploadApartments(api, building.id, [row]);
  expect(result.counts).toEqual({ created: 0, existing: 0, duplicate: 0, error: 1 });
  expect(await readBuildingApartments(api, building.id)).toEqual([]);
  const after = await api.send(HTTP_METHODS.GET, contactsPath(customer.id));
  expect(await after.json()).toEqual(original);
});

test("structural invalid template creates nothing", async ({ api }) => {
  const building = await seedBuilding(api, await seedCustomer(api));
  const response = await api.upload(importPath(building.id), {
    name: APARTMENT_IMPORT.FILE_NAME,
    mimeType: APARTMENT_IMPORT.MIME_TYPE,
    buffer: await makeImportWorkbook(
      [buildImportRow(buildCustomerInput())],
      [...APARTMENT_IMPORT.HEADERS].reverse(),
    ),
  });
  expect(response.status()).toBe(422);
  expect(await response.json()).toMatchObject({ code: "INVALID_TEMPLATE" });
  expect(await readBuildingApartments(api, building.id)).toEqual([]);
});

test("concurrent imports create exactly one apartment and one pair of contacts", async ({
  api,
}) => {
  const building = await seedBuilding(api, await seedCustomer(api));
  const row = buildImportRow(buildCustomerInput());
  const results = await Promise.all([
    uploadApartments(api, building.id, [row]),
    uploadApartments(api, building.id, [row]),
  ]);
  expect(results.reduce((sum, result) => sum + result.counts.created, 0)).toBe(1);
  expect(results.reduce((sum, result) => sum + result.counts.existing, 0)).toBe(1);
  const apartments = await readBuildingApartments(api, building.id);
  expect(apartments).toHaveLength(1);
  const contacts = await api.send(HTTP_METHODS.GET, contactsPath(apartments[0].customerId));
  expect(await contacts.json()).toHaveLength(2);
});

test("concurrent imports in different buildings reuse one new customer and contact pair", async ({
  api,
}) => {
  const owner = await seedCustomer(api);
  const firstBuilding = await seedBuilding(api, owner);
  const secondBuilding = await seedBuilding(api, owner);
  const customer = buildCustomerInput();
  const results = await Promise.all([
    uploadApartments(api, firstBuilding.id, [buildImportRow(customer, "1")]),
    uploadApartments(api, secondBuilding.id, [buildImportRow(customer, "2")]),
  ]);
  for (const result of results) {
    expect(result.counts).toEqual({ created: 1, existing: 0, duplicate: 0, error: 0 });
  }
  const first = await readBuildingApartments(api, firstBuilding.id);
  const second = await readBuildingApartments(api, secondBuilding.id);
  expect(first).toHaveLength(1);
  expect(second).toHaveLength(1);
  expect(first[0].customerId).toBe(second[0].customerId);
  expect(first[0].customerApartment).toBe("1");
  expect(second[0].customerApartment).toBe("2");
  const lookup = await api.send(HTTP_METHODS.GET, `/customer?search=${customer.taxId}`);
  expect(await lookup.json()).toMatchObject({
    items: [expect.objectContaining({ id: first[0].customerId, taxId: customer.taxId })],
  });
  const contacts = await api.send(HTTP_METHODS.GET, contactsPath(first[0].customerId));
  expect(await contacts.json()).toHaveLength(2);
});

test("100rows persist without customer or contact duplication", async ({ api }) => {
  const building = await seedBuilding(api, await seedCustomer(api));
  const customer = buildCustomerInput();
  const rows = Array.from({ length: 100 }, (_, index) =>
    buildImportRow(customer, String(index + 1)),
  );
  const result = await uploadApartments(api, building.id, rows);
  expect(result.counts).toEqual({ created: 100, existing: 0, duplicate: 0, error: 0 });
  const apartments = await readBuildingApartments(api, building.id);
  expect(apartments).toHaveLength(100);
  expect(new Set(apartments.map(apartment => apartment.customerId)).size).toBe(1);
  const contacts = await api.send(HTTP_METHODS.GET, contactsPath(apartments[0].customerId));
  expect(await contacts.json()).toHaveLength(2);
});

for (const role of USER_ROLE_VALUES.filter(role => role !== USER_ROLES.SYSTEM_ADMIN)) {
  test(`${role} cannot acquire customerwrite through import`, async ({ api, apiAs }) => {
    const building = await seedBuilding(api, await seedCustomer(api));
    const actor = await apiAs(TEST_USERS[role]);
    const response = await actor.upload(importPath(building.id), {
      name: APARTMENT_IMPORT.FILE_NAME,
      mimeType: APARTMENT_IMPORT.MIME_TYPE,
      buffer: await makeImportWorkbook([buildImportRow(buildCustomerInput())]),
    });
    expect(response.status()).toBe(403);
    expect(await readBuildingApartments(api, building.id)).toEqual([]);
  });
}
