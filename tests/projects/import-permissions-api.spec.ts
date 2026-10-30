import {
  importPath,
  contactsPath,
  buildImportRow,
  makeImportWorkbook,
} from "../../src/utilities/apartment-import.utility.ts";

import { isRecord } from "../../src/utilities/guard.utility.ts";
import { test, expect } from "../../src/fixtures/api.fixture.ts";
import { HTTP_METHODS } from "../../src/constants/http.constant.ts";
import { USER_ROLES } from "../../src/constants/user-role.constant.ts";
import { TEST_USERS } from "../../src/constants/test-users.constant.ts";
import { PERMISSIONS } from "../../src/constants/permission.constant.ts";
import { withRolePermissions } from "../../src/environment/role-permissions.ts";
import { APARTMENT_IMPORT } from "../../src/constants/apartment-import.constant.ts";
import { seedBuilding, seedCustomer, buildCustomerInput } from "../../src/api/seed-data.ts";
import { uploadApartments, readBuildingApartments } from "../../src/api/apartment-import.api.ts";

const IMPORT_GRANTS = [
  PERMISSIONS.APARTMENTS_CREATE,
  PERMISSIONS.CUSTOMERS_CREATE,
  PERMISSIONS.CUSTOMERS_UPDATE,
];

for (const missing of IMPORT_GRANTS) {
  test(`import and template require ${missing} even for system admin`, async ({ api }) => {
    const building = await seedBuilding(api, await seedCustomer(api));
    const file = {
      name: APARTMENT_IMPORT.FILE_NAME,
      mimeType: APARTMENT_IMPORT.MIME_TYPE,
      buffer: await makeImportWorkbook([buildImportRow(buildCustomerInput())]),
    };
    await withRolePermissions(
      USER_ROLES.SYSTEM_ADMIN,
      IMPORT_GRANTS.filter(key => key !== missing),
      async () => {
        expect((await api.download(`${importPath(building.id)}/template`)).status()).toBe(403);
        expect((await api.upload(importPath(building.id), file)).status()).toBe(403);
      },
    );
    expect(await readBuildingApartments(api, building.id)).toEqual([]);
  });
}

test("system admin has no implicit import or template bypass with zero grants", async ({ api }) => {
  const building = await seedBuilding(api, await seedCustomer(api));
  const file = {
    name: APARTMENT_IMPORT.FILE_NAME,
    mimeType: APARTMENT_IMPORT.MIME_TYPE,
    buffer: await makeImportWorkbook([buildImportRow(buildCustomerInput())]),
  };
  await withRolePermissions(USER_ROLES.SYSTEM_ADMIN, [], async () => {
    expect((await api.download(`${importPath(building.id)}/template`)).status()).toBe(403);
    expect((await api.upload(importPath(building.id), file)).status()).toBe(403);
  });
  expect(await readBuildingApartments(api, building.id)).toEqual([]);
});

test("same non-admin token imports with all grants and loses access when a grant is revoked", async ({
  api,
  apiAs,
}) => {
  const building = await seedBuilding(api, await seedCustomer(api));
  const actor = await apiAs(TEST_USERS[USER_ROLES.FINANCE]);
  const first = buildImportRow(buildCustomerInput(), "1");
  await withRolePermissions(USER_ROLES.FINANCE, IMPORT_GRANTS, async () => {
    expect((await actor.download(`${importPath(building.id)}/template`)).status()).toBe(200);
    expect((await uploadApartments(actor, building.id, [first])).counts).toEqual({
      created: 1,
      existing: 0,
      duplicate: 0,
      error: 0,
    });
    await withRolePermissions(
      USER_ROLES.FINANCE,
      [PERMISSIONS.APARTMENTS_CREATE, PERMISSIONS.CUSTOMERS_CREATE],
      async () => {
        expect((await actor.download(`${importPath(building.id)}/template`)).status()).toBe(403);
        expect(
          (
            await actor.upload(importPath(building.id), {
              name: APARTMENT_IMPORT.FILE_NAME,
              mimeType: APARTMENT_IMPORT.MIME_TYPE,
              buffer: await makeImportWorkbook([buildImportRow(buildCustomerInput(), "2")]),
            })
          ).status(),
        ).toBe(403);
      },
    );
  });
  const apartments = await readBuildingApartments(api, building.id);
  expect(apartments).toHaveLength(1);
  expect(apartments[0].customerApartment).toBe("1");
});

test("customer contact reads and writes follow current granular grants not role", async ({
  api,
  apiAs,
}) => {
  const customer = await seedCustomer(api);
  const actor = await apiAs(TEST_USERS[USER_ROLES.FINANCE]);
  const path = contactsPath(customer.id);
  await withRolePermissions(USER_ROLES.FINANCE, [], async () => {
    expect((await actor.send(HTTP_METHODS.GET, path)).status()).toBe(403);
    expect((await actor.send(HTTP_METHODS.POST, path, { name: "איש קשר מורשה" })).status()).toBe(
      403,
    );
  });
  await withRolePermissions(USER_ROLES.FINANCE, [PERMISSIONS.CUSTOMERS_UPDATE], async () => {
    expect((await actor.send(HTTP_METHODS.GET, path)).status()).toBe(403);
    const created = await actor.send(HTTP_METHODS.POST, path, { name: "איש קשר מורשה" });
    expect(created.status()).toBe(201);
    const contact: unknown = await created.json();
    if (!isRecord(contact) || typeof contact.id !== "string") {
      throw new Error("Unexpected contact response");
    }

    expect(
      (
        await actor.send(HTTP_METHODS.PATCH, `${path}/${contact.id}`, { name: "איש קשר מעודכן" })
      ).status(),
    ).toBe(200);
    await withRolePermissions(USER_ROLES.FINANCE, [PERMISSIONS.CUSTOMERS_READ], async () => {
      const readable = await actor.send(HTTP_METHODS.GET, path);
      expect(readable.status()).toBe(200);
      expect(await readable.json()).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ id: contact.id, name: "איש קשר מעודכן" }),
        ]),
      );
      expect(
        (await actor.send(HTTP_METHODS.POST, path, { name: "אין הרשאת כתיבה" })).status(),
      ).toBe(403);
      expect(
        (
          await actor.send(HTTP_METHODS.PATCH, `${path}/${contact.id}`, { name: "שינוי אסור" })
        ).status(),
      ).toBe(403);
      const unchanged = await actor.send(HTTP_METHODS.GET, path);
      expect(await unchanged.json()).toEqual(await readable.json());
    });
  });
});
