import {
  seedUser,
  seedProject,
  seedCustomer,
  seedBuilding,
  buildCustomerInput,
  seedStandaloneProject,
} from "../../src/api/seed-data.ts";

import { randomUUID } from "node:crypto";
import { test, expect } from "../../src/fixtures/api.fixture.ts";
import { HTTP_METHODS } from "../../src/constants/http.constant.ts";
import { USER_ROLES } from "../../src/constants/user-role.constant.ts";
import { TEST_USERS } from "../../src/constants/test-users.constant.ts";
import { PERMISSIONS } from "../../src/constants/permission.constant.ts";
import { createUniqueName } from "../../src/utilities/test-data.utility.ts";
import { withRolePermissions } from "../../src/environment/role-permissions.ts";
import { scopedApartmentNumber } from "../../src/utilities/apartment-fixture.utility.ts";
import { updateProjectRelationFixture } from "../../src/environment/customer-projects-data.ts";
import { PROJECT_TYPE_NAMES, PROJECT_STATUS_NAMES } from "../../src/constants/domain.constant.ts";
import { readCustomerProjects, customerProjectsPath } from "../../src/api/customer-projects.api.ts";

test("customer-ID isolation and approved building/apartment grouping use the same counts and rows", async ({
  api,
}) => {
  const customer = await seedCustomer(api);
  const other = await api.createCustomer({ ...buildCustomerInput(), name: customer.name });
  const building = await seedBuilding(api, customer);
  const foreign = await seedBuilding(api, other);
  const standalone = await seedStandaloneProject(api, customer);
  const ownApartment = await api.createApartment(building.id, {
    customerId: customer.id,
    customerFloor: 1,
    customerApartment: scopedApartmentNumber("11"),
  });
  const otherApartment = await api.createApartment(building.id, {
    customerId: other.id,
    customerFloor: 2,
    customerApartment: scopedApartmentNumber("12"),
  });
  const directApartment = await api.createApartment(foreign.id, {
    customerId: customer.id,
    customerFloor: 3,
    customerApartment: scopedApartmentNumber("13"),
  });
  const page = await readCustomerProjects(api, customer.id);
  expect(page.total).toBe(3);
  expect(page.items.map(item => item.id).sort()).toEqual(
    [building.id, standalone.id, directApartment.id].sort(),
  );
  expect(page.items.find(item => item.id === building.id)).toMatchObject({
    kind: "building",
    apartmentCount: 2,
  });
  expect(page.items.find(item => item.id === directApartment.id)).toMatchObject({
    kind: "apartment",
    building: { id: foreign.id, name: foreign.name, code: foreign.code },
  });
  expect(page.items.map(item => item.id)).not.toContain(ownApartment.id);
  expect(Object.values(page.counts.byStage).reduce((sum, count) => sum + count, 0)).toBe(3);
  const otherPage = await readCustomerProjects(api, other.id);
  expect(otherPage.items.map(item => item.id).sort()).toEqual(
    [foreign.id, otherApartment.id].sort(),
  );
  expect(otherPage.items.some(item => item.id === standalone.id)).toBe(false);
});

test("deleted projects/parents are omitted and a null-owner parent preserves a directly linked apartment", async ({
  api,
}) => {
  const customer = await seedCustomer(api);
  const other = await seedCustomer(api);
  const foreign = await seedBuilding(api, other);
  const apartment = await api.createApartment(foreign.id, {
    customerId: customer.id,
    customerFloor: 1,
    customerApartment: scopedApartmentNumber("21"),
  });
  await updateProjectRelationFixture(foreign.id, { customerId: null });
  expect((await readCustomerProjects(api, customer.id)).items.map(item => item.id)).toEqual([
    apartment.id,
  ]);
  await updateProjectRelationFixture(foreign.id, { deleted: true });
  expect(await readCustomerProjects(api, customer.id)).toMatchObject({
    total: 0,
    items: [],
    nextCursor: null,
    counts: { byStage: {} },
  });
  const standalone = await seedStandaloneProject(api, customer);
  await updateProjectRelationFixture(standalone.id, { deleted: true });
  expect((await readCustomerProjects(api, customer.id)).total).toBe(0);
});

test("default keyset pages are 8 then 10, stable across ties, unicode names and scope changes", async ({
  api,
}) => {
  const customer = await seedCustomer(api);
  const ids: string[] = [];
  for (const _ of Array.from({ length: 19 })) {
    const project = await seedStandaloneProject(api, customer);
    await updateProjectRelationFixture(project.id, {
      name: `${"🏠".repeat(160)}${project.id}`,
      updatedAt: "2026-01-01T00:00:00.000Z",
    });
    ids.push(project.id);
  }
  const first = await readCustomerProjects(api, customer.id);
  expect(first.items).toHaveLength(8);
  expect(first.nextCursor).not.toBeNull();
  const second = await readCustomerProjects(api, customer.id, {
    batchCursor: first.nextCursor ?? "",
  });
  expect(second.items).toHaveLength(10);
  const third = await readCustomerProjects(api, customer.id, {
    batchCursor: second.nextCursor ?? "",
  });
  expect(third.items).toHaveLength(1);
  expect(third.nextCursor).toBeNull();
  expect([...first.items, ...second.items, ...third.items].map(item => item.id).sort()).toEqual(
    ids.sort(),
  );
  const other = await seedCustomer(api);
  for (const path of [
    customerProjectsPath(other.id, { batchCursor: first.nextCursor ?? "" }),
    customerProjectsPath(customer.id, { batchCursor: first.nextCursor ?? "", search: "changed" }),
  ]) {
    expect((await api.send(HTTP_METHODS.GET, path)).status()).toBe(400);
  }
});

test("search is literal and server-side; stage counts ignore the selected stage and unknown customers return 404", async ({
  api,
}) => {
  const customer = await seedCustomer(api);
  const exact = await seedStandaloneProject(api, customer);
  const other = await seedStandaloneProject(api, customer);
  const pending = await api.findProjectStage(PROJECT_STATUS_NAMES.PENDING);
  const done = await api.findProjectStage(PROJECT_STATUS_NAMES.DONE);
  await updateProjectRelationFixture(exact.id, { name: createUniqueName("פרויקט %_ ייחודי") });
  expect(
    (await api.send(HTTP_METHODS.PATCH, `/project/${exact.id}`, { stageId: pending.id })).ok(),
  ).toBe(true);
  expect(
    (await api.send(HTTP_METHODS.PATCH, `/project/${other.id}`, { stageId: done.id })).ok(),
  ).toBe(true);
  expect(
    (await readCustomerProjects(api, customer.id, { search: "%_" })).items.map(item => item.id),
  ).toEqual([exact.id]);
  const filtered = await readCustomerProjects(api, customer.id, { stageId: pending.id });
  expect(filtered.items.map(item => item.id)).toEqual([exact.id]);
  expect(filtered.counts.byStage).toMatchObject({ [pending.id]: 1, [done.id]: 1 });
  const invalidQueries: Record<string, string>[] = [
    { batchCursor: "bad" },
    { batchSize: "0" },
    { batchSize: "101" },
    { stageId: "bad" },
  ];
  for (const query of invalidQueries) {
    expect(
      (await api.send(HTTP_METHODS.GET, customerProjectsPath(customer.id, query))).status(),
    ).toBe(400);
  }
  expect((await api.send(HTTP_METHODS.GET, customerProjectsPath(randomUUID()))).status()).toBe(404);
});

test("both customer-read and project-read grants are required and live revocation is enforced", async ({
  api,
  apiAs,
}) => {
  const customer = await seedCustomer(api);
  const viewer = await apiAs(TEST_USERS[USER_ROLES.ENGINEER]);
  const path = customerProjectsPath(customer.id);
  for (const permissions of [[], [PERMISSIONS.CUSTOMERS_READ], [PERMISSIONS.PROJECTS_READ]]) {
    await withRolePermissions(USER_ROLES.ENGINEER, permissions, async () => {
      expect((await viewer.send(HTTP_METHODS.GET, path)).status()).toBe(403);
    });
  }
  await withRolePermissions(
    USER_ROLES.ENGINEER,
    [PERMISSIONS.CUSTOMERS_READ, PERMISSIONS.PROJECTS_READ],
    async () => {
      expect((await viewer.send(HTTP_METHODS.GET, path)).status()).toBe(200);
    },
  );
});

test("parent context search returns only the customer's apartment and inherited teams expose no user secrets", async ({
  api,
}) => {
  const customer = await seedCustomer(api);
  const other = await seedCustomer(api);
  const engineer = await seedUser(api, USER_ROLES.ENGINEER);
  const building = await seedProject(api, {
    customer: other,
    projectTypeName: PROJECT_TYPE_NAMES.RESIDENTIAL_BUILDING,
    members: [{ userId: engineer.id, role: USER_ROLES.ENGINEER }],
  });
  const apartment = await api.createApartment(building.id, {
    customerId: customer.id,
    customerFloor: 4,
    customerApartment: scopedApartmentNumber("51"),
  });
  for (const search of [building.name, building.code]) {
    const page = await readCustomerProjects(api, customer.id, { search });
    expect(page.items).toHaveLength(1);
    expect(page.items[0]).toMatchObject({
      id: apartment.id,
      building: { id: building.id },
      members: [
        { user: { id: engineer.id, firstName: engineer.firstName, lastName: engineer.lastName } },
      ],
    });
    expect(Object.keys(page.items[0].members[0].user ?? {}).sort()).toEqual([
      "firstName",
      "id",
      "lastName",
    ]);
    expect(JSON.stringify(page)).not.toContain(engineer.email);
    expect(JSON.stringify(page)).not.toContain(engineer.password);
  }
});
