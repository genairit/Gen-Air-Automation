import {
  PAYMENT_TERMS,
  PROJECT_STATUS_NAMES,
  CUSTOMER_SYNC_STATUSES,
} from "../../src/constants/domain.constant.ts";

import {
  buildProjectPath,
  buildCustomerPath,
  buildApartmentsPath,
} from "../../src/utilities/api-path.utility.ts";

import {
  recreateLegacyApartment,
  setApartmentCustomerSyncStatus,
} from "../../src/environment/apartment-legacy-data.ts";

import {
  expectForbidden,
  expectBadRequest,
  expectResponseOk,
  expectResponseStatus,
} from "../../src/utilities/response-assertion.utility.ts";

import type { TGenAirApi } from "../../src/api/gen-air-api.ts";
import { isRecord } from "../../src/utilities/guard.utility.ts";
import { test, expect } from "../../src/fixtures/test.fixture.ts";
import { TEST_USERS } from "../../src/constants/test-users.constant.ts";
import { ROLE_ACCESS } from "../../src/constants/role-access.constant.ts";
import { HTTP_METHODS, HTTP_STATUS } from "../../src/constants/http.constant.ts";
import { seedBuilding, seedCustomer, seedUser } from "../../src/api/seed-data.ts";
import { LEGACY_APARTMENT } from "../../src/constants/apartment-backend.constant.ts";
import type { IProject, ICustomer } from "../../src/interfaces/entities.interface.ts";
import { createApartmentNumber } from "../../src/utilities/apartment-fixture.utility.ts";
import { scopedApartmentNumber } from "../../src/utilities/apartment-fixture.utility.ts";
import { USER_ROLES, USER_ROLE_VALUES } from "../../src/constants/user-role.constant.ts";
import { verifyApartmentMigration } from "../../src/environment/apartment-migration-check.ts";

const MISSING_ID = "00000000-0000-4000-8000-000000000000";
const MEMBER_ROLE = USER_ROLES.ENGINEER;

const input = (customerId: string, changes: object = {}) => ({
  customerId,
  customerFloor: 3,
  customerApartment: createApartmentNumber(),
  ...changes,
});
const readPath = async (api: TGenAirApi, path: string): Promise<Record<string, unknown>> => {
  const response = await api.send(HTTP_METHODS.GET, path);
  await expectResponseOk(response);
  const body: unknown = await response.json();
  if (!isRecord(body)) {
    throw new Error("Project response must be an object");
  }

  return body;
};
const read = (api: TGenAirApi, projectId: string) => readPath(api, buildProjectPath(projectId));
const create = (api: TGenAirApi, building: IProject, customer: ICustomer, changes: object = {}) =>
  api.createApartment(building.id, input(customer.id, changes));
const update = async (api: TGenAirApi, id: string, changes: object) => {
  const response = await api.send(HTTP_METHODS.PATCH, buildProjectPath(id), changes);
  await expectResponseOk(response);
};
const scenario = async (api: TGenAirApi) => ({
  building: await seedBuilding(api, await seedCustomer(api)),
  customer: await seedCustomer(api),
});

test("migration upgrades legacy apartments without losing data, backfills teams and retains hierarchy constraints", async ({
  api,
}) => {
  const { building, customer } = await scenario(api);
  const member = await seedUser(api, MEMBER_ROLE);
  const own = await create(api, building, customer, {
    members: [{ userId: member.id, role: MEMBER_ROLE }],
  });
  const inherited = await create(api, building, customer);
  const unrelated = await create(api, building, customer);
  await verifyApartmentMigration({
    ownId: own.id,
    inheritedId: inherited.id,
    customerId: customer.id,
  });
  expect(await read(api, unrelated.id)).toMatchObject({ customerId: customer.id });
});

test("new apartment links its own customer and reads contact live without inheriting the building customer", async ({
  api,
}) => {
  const { building, customer } = await scenario(api);
  const apartment = await create(api, building, customer, {
    customerApartment: scopedApartmentNumber("24א"),
  });
  expect(await read(api, apartment.id)).toMatchObject({
    customerId: customer.id,
    customerName: customer.name,
    contactName: customer.contactName,
    hasOwnTeam: false,
    customerApartment: scopedApartmentNumber("24א"),
    parentProjectId: building.id,
  });
  await update(api, apartment.id, { notes: "Apartment note" });
  const response = await api.send(HTTP_METHODS.PATCH, buildCustomerPath(customer.id), {
    contactName: "Updated customer contact",
    phone: "0531234567",
  });
  await expectResponseOk(response);
  expect(await read(api, apartment.id)).toMatchObject({
    contactName: "Updated customer contact",
    contactPhone: "0531234567",
    customerPhone: "0531234567",
  });
});

test("create rejects missing, malformed, failed and deleted customers but accepts pending and synced customers", async ({
  api,
}) => {
  const { building, customer } = await scenario(api);
  for (const body of [
    { customerFloor: 1, customerApartment: scopedApartmentNumber("1") },
    input("bad-id"),
    input(MISSING_ID),
  ]) {
    await expectBadRequest(
      await api.send(HTTP_METHODS.POST, buildApartmentsPath(building.id), body),
    );
  }
  await setApartmentCustomerSyncStatus(customer.id, CUSTOMER_SYNC_STATUSES.FAILED);
  await expectBadRequest(
    await api.send(HTTP_METHODS.POST, buildApartmentsPath(building.id), input(customer.id)),
  );
  for (const status of [CUSTOMER_SYNC_STATUSES.PENDING, CUSTOMER_SYNC_STATUSES.SYNCED]) {
    await setApartmentCustomerSyncStatus(customer.id, status);
    await create(api, building, customer);
  }
  const removed = await seedCustomer(api);
  const response = await api.send(HTTP_METHODS.DELETE, buildCustomerPath(removed.id));
  await expectResponseOk(response);
  await expectBadRequest(
    await api.send(HTTP_METHODS.POST, buildApartmentsPath(building.id), input(removed.id)),
  );
});

test("apartment number validation, duplicate Hebrew feedback, stage independence and legacy display persist", async ({
  api,
}) => {
  const { building, customer } = await scenario(api);
  for (const invalid of [
    { customerId: customer.id, customerApartment: scopedApartmentNumber("23") },
    input(customer.id, { customerFloor: null }),
    input(customer.id, { customerFloor: 3.5 }),
    input(customer.id, { customerFloor: 1000 }),
    input(customer.id, { contactName: "Forged contact", contactPhone: "0521234567" }),
  ]) {
    await expectBadRequest(
      await api.send(HTTP_METHODS.POST, buildApartmentsPath(building.id), invalid),
    );
  }
  for (const number of ["", "24AB", "24-1", "א24"]) {
    await expectBadRequest(
      await api.send(
        HTTP_METHODS.POST,
        buildApartmentsPath(building.id),
        input(customer.id, { customerApartment: number }),
      ),
    );
  }
  const apartment = await create(api, building, customer, {
    customerApartment: scopedApartmentNumber("24א"),
  });
  const duplicate = await api.send(
    HTTP_METHODS.POST,
    buildApartmentsPath(building.id),
    input(customer.id, { customerApartment: scopedApartmentNumber("24א") }),
  );
  await expectResponseStatus(duplicate, HTTP_STATUS.CONFLICT);
  expect(await duplicate.text()).toContain(`דירה ${scopedApartmentNumber("24א")} כבר קיימת בבניין`);
  const before = await read(api, building.id);
  const stage = await api.findProjectStage(PROJECT_STATUS_NAMES.IN_PROGRESS);
  const moved = await api.send(HTTP_METHODS.PATCH, `${buildProjectPath(apartment.id)}/stage`, {
    stageId: stage.id,
  });
  await expectResponseOk(moved);
  expect(await read(api, apartment.id)).toMatchObject({ stageId: stage.id });
  expect((await read(api, building.id)).stageId).toBe(before.stageId);
  await recreateLegacyApartment(apartment.id);
  expect(await read(api, apartment.id)).toMatchObject({
    customerId: null,
    customerName: LEGACY_APARTMENT.CUSTOMER_NAME,
    contactName: LEGACY_APARTMENT.CONTACT_NAME,
    contactPhone: LEGACY_APARTMENT.CONTACT_PHONE,
  });
});

test("team inheritance follows parent changes, explicit empty overrides stay empty, and reset returns to the parent", async ({
  api,
}) => {
  const { building, customer } = await scenario(api);
  const first = await seedUser(api, MEMBER_ROLE);
  const second = await seedUser(api, MEMBER_ROLE);
  const firstTeam = [{ userId: first.id, role: MEMBER_ROLE }];
  const secondTeam = [{ userId: second.id, role: MEMBER_ROLE }];
  await update(api, building.id, { members: firstTeam });
  const inherited = await create(api, building, customer);
  const empty = await create(api, building, customer, { members: [] });
  expect(await read(api, inherited.id)).toMatchObject({
    hasOwnTeam: false,
    members: [expect.objectContaining(firstTeam[0])],
  });
  expect(await read(api, empty.id)).toMatchObject({ hasOwnTeam: true, members: [] });
  await update(api, building.id, { members: secondTeam });
  expect(await read(api, inherited.id)).toMatchObject({
    members: [expect.objectContaining(secondTeam[0])],
  });
  expect(await read(api, empty.id)).toMatchObject({ members: [] });
  const listing = await readPath(api, buildApartmentsPath(building.id));
  if (!Array.isArray(listing.items)) {
    throw new Error("Apartment listing must include items");
  }
  const listed = listing.items.find((item: unknown) => isRecord(item) && item.id === inherited.id);
  expect(listed).toMatchObject({
    customerId: customer.id,
    customerName: customer.name,
    contactName: customer.contactName,
    members: [expect.objectContaining(secondTeam[0])],
  });
  await update(api, inherited.id, { members: firstTeam });
  expect(await read(api, inherited.id)).toMatchObject({
    hasOwnTeam: true,
    members: [expect.objectContaining(firstTeam[0])],
  });
  await update(api, inherited.id, { hasOwnTeam: false });
  expect(await read(api, inherited.id)).toMatchObject({
    hasOwnTeam: false,
    members: [expect.objectContaining(secondTeam[0])],
  });
  await expectBadRequest(
    await api.send(HTTP_METHODS.PATCH, buildProjectPath(inherited.id), {
      hasOwnTeam: false,
      members: firstTeam,
    }),
  );
  await expectBadRequest(
    await api.send(HTTP_METHODS.PATCH, buildProjectPath(building.id), { hasOwnTeam: true }),
  );
});

test("creation payment terms can override the parent while unset terms continue to inherit", async ({
  api,
}) => {
  const { building, customer } = await scenario(api);
  const inherited = await create(api, building, customer);
  const overridden = await create(api, building, customer, {
    paymentTerms: PAYMENT_TERMS.OTHER,
    paymentTermsNote: "Apartment specific payment agreement",
  });
  expect(await read(api, overridden.id)).toMatchObject({
    paymentTerms: PAYMENT_TERMS.OTHER,
    paymentTermsNote: "Apartment specific payment agreement",
  });
  await update(api, building.id, { paymentTerms: PAYMENT_TERMS.TWELVE_PREPAID_CHECKS });
  expect(await read(api, inherited.id)).toMatchObject({
    paymentTerms: PAYMENT_TERMS.TWELVE_PREPAID_CHECKS,
  });
  expect(await read(api, overridden.id)).toMatchObject({ paymentTerms: PAYMENT_TERMS.OTHER });
  for (const changes of [
    { paymentTerms: PAYMENT_TERMS.PREPAID },
    { paymentTerms: PAYMENT_TERMS.OTHER },
    { paymentTermsNote: "Note without choosing terms" },
  ]) {
    await expectBadRequest(
      await api.send(
        HTTP_METHODS.POST,
        buildApartmentsPath(building.id),
        input(customer.id, changes),
      ),
    );
  }
});

for (const role of USER_ROLE_VALUES) {
  test(`${role} apartment creation and team changes retain project-editor permissions`, async ({
    api,
    apiAs,
  }) => {
    const { building, customer } = await scenario(api);
    const apartment = await create(api, building, customer);
    const editor = await apiAs(TEST_USERS[role]);
    const created = await editor.send(
      HTTP_METHODS.POST,
      buildApartmentsPath(building.id),
      input(customer.id),
    );
    const changed = await editor.send(HTTP_METHODS.PATCH, buildProjectPath(apartment.id), {
      members: [],
    });
    if (ROLE_ACCESS[role].canEditProject) {
      await expectResponseStatus(created, HTTP_STATUS.CREATED);
      await expectResponseOk(changed);
      return;
    }
    await expectForbidden(created);
    await expectForbidden(changed);
  });
}
