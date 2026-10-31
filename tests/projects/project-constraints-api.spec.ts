import {
  seedBuilding,
  seedCustomer,
  buildCustomerInput,
  seedStandaloneProject,
  buildStandaloneProjectInput,
} from "../../src/api/seed-data.ts";

import {
  readProjectConstraints,
  projectNameAvailabilityPath,
  readProjectConstraintResponse,
} from "../../src/api/project-constraints.api.ts";

import { isRecord } from "../../src/utilities/guard.utility.ts";
import { test, expect } from "../../src/fixtures/api.fixture.ts";
import { HTTP_METHODS } from "../../src/constants/http.constant.ts";
import { USER_ROLES } from "../../src/constants/user-role.constant.ts";
import { TEST_USERS } from "../../src/constants/test-users.constant.ts";
import { PERMISSIONS } from "../../src/constants/permission.constant.ts";
import { createUniqueName } from "../../src/utilities/test-data.utility.ts";
import { withRolePermissions } from "../../src/environment/role-permissions.ts";
import { buildImportRow } from "../../src/utilities/apartment-import.utility.ts";
import { createApartmentNumber } from "../../src/utilities/apartment-fixture.utility.ts";
import { PROJECT_CONSTRAINTS } from "../../src/constants/project-constraints.constant.ts";
import { uploadApartments, readBuildingApartments } from "../../src/api/apartment-import.api.ts";

test("exact names normalize outer whitespace while preserving case and internal spaces", async ({
  api,
}) => {
  const customer = await seedCustomer(api);
  const input = await buildStandaloneProjectInput(api, customer);
  const name = createUniqueName("Exact Case  Name");
  const project = await api.createProject({ ...input, name: `\u00a0 ${name}\t\ufeff` });
  expect(project.name).toBe(name);
  const duplicate = await api.send(HTTP_METHODS.POST, "/project", { ...input, name });
  expect(duplicate.status()).toBe(409);
  expect(await duplicate.json()).toMatchObject({ code: PROJECT_CONSTRAINTS.NAME_CONFLICT_CODE });
  expect((await api.createProject({ ...input, name: name.toLowerCase() })).name).toBe(
    name.toLowerCase(),
  );
  expect((await api.createProject({ ...input, name: name.replace("  ", " ") })).name).toBe(
    name.replace("  ", " "),
  );
  const unavailable = await api.send(
    HTTP_METHODS.GET,
    projectNameAvailabilityPath(`\t${name}\u00a0`),
  );
  expect(await unavailable.json()).toEqual({ available: false });
  const own = await api.send(HTTP_METHODS.GET, projectNameAvailabilityPath(name, project.id));
  expect(await own.json()).toEqual({ available: true });
  expect((await api.send(HTTP_METHODS.PATCH, `/project/${project.id}`, { name })).status()).toBe(
    200,
  );
});

test("rename conflicts preserve both projects and soft-deleted names can be reused", async ({
  api,
}) => {
  const customer = await seedCustomer(api);
  const first = await seedStandaloneProject(api, customer);
  const second = await seedStandaloneProject(api, customer);
  const conflict = await api.send(HTTP_METHODS.PATCH, `/project/${second.id}`, {
    name: first.name,
  });
  expect(conflict.status()).toBe(409);
  expect((await readProjectConstraints(api, second.id)).name).toBe(second.name);
  expect((await api.send(HTTP_METHODS.DELETE, `/project/${first.id}`)).status()).toBe(204);
  const input = await buildStandaloneProjectInput(api, customer);
  expect((await api.createProject({ ...input, name: first.name })).name).toBe(first.name);
});

test("concurrent exact creates and renames each have one committed winner and one domain conflict", async ({
  api,
}) => {
  const customer = await seedCustomer(api);
  const input = await buildStandaloneProjectInput(api, customer);
  const name = createUniqueName("Concurrent create");
  const created = await Promise.all([
    api.send(HTTP_METHODS.POST, "/project", { ...input, name }),
    api.send(HTTP_METHODS.POST, "/project", { ...input, name }),
  ]);
  expect(created.map(response => response.status()).sort()).toEqual([201, 409]);
  const rejectedCreate = created.find(response => response.status() === 409);
  expect(await rejectedCreate?.json()).toMatchObject({
    code: PROJECT_CONSTRAINTS.NAME_CONFLICT_CODE,
  });
  const first = await seedStandaloneProject(api, customer);
  const second = await seedStandaloneProject(api, customer);
  const renamed = createUniqueName("Concurrent rename");
  const responses = await Promise.all([
    api.send(HTTP_METHODS.PATCH, `/project/${first.id}`, { name: renamed }),
    api.send(HTTP_METHODS.PATCH, `/project/${second.id}`, { name: renamed }),
  ]);
  expect(responses.map(response => response.status()).sort()).toEqual([200, 409]);
  const names = await Promise.all([
    readProjectConstraints(api, first.id),
    readProjectConstraints(api, second.id),
  ]);
  expect(names.filter(project => project.name === renamed)).toHaveLength(1);
});

test("lighting supports defaults, zero, decimals, partial edits and disabled clearing through durable reads", async ({
  api,
}) => {
  const input = await buildStandaloneProjectInput(api, await seedCustomer(api));
  const defaultProject = await readProjectConstraintResponse(
    await api.send(HTTP_METHODS.POST, "/project", input),
  );
  expect(defaultProject).toMatchObject({
    hasGeneralLightingCeilingLowering: false,
    generalLightingCeilingLoweringHeight: null,
  });
  const project = await readProjectConstraintResponse(
    await api.send(HTTP_METHODS.POST, "/project", {
      ...input,
      name: createUniqueName("Lighting"),
      hasGeneralLightingCeilingLowering: true,
      generalLightingCeilingLoweringHeight: 0,
    }),
  );
  expect(project.generalLightingCeilingLoweringHeight).toBe(0);
  await api.send(HTTP_METHODS.PATCH, `/project/${project.id}`, {
    generalLightingCeilingLoweringHeight: 25.125,
  });
  expect((await readProjectConstraints(api, project.id)).generalLightingCeilingLoweringHeight).toBe(
    25.125,
  );
  await api.send(HTTP_METHODS.PATCH, `/project/${project.id}`, {
    name: createUniqueName("Lighting renamed"),
  });
  expect((await readProjectConstraints(api, project.id)).generalLightingCeilingLoweringHeight).toBe(
    25.125,
  );
  await api.send(HTTP_METHODS.PATCH, `/project/${project.id}`, {
    hasGeneralLightingCeilingLowering: false,
  });
  expect(await readProjectConstraints(api, project.id)).toMatchObject({
    hasGeneralLightingCeilingLowering: false,
    generalLightingCeilingLoweringHeight: null,
  });
  expect(
    (
      await api.send(HTTP_METHODS.PATCH, `/project/${project.id}`, {
        hasGeneralLightingCeilingLowering: true,
      })
    ).status(),
  ).toBe(400);
  expect((await readProjectConstraints(api, project.id)).hasGeneralLightingCeilingLowering).toBe(
    false,
  );
});

test("invalid lighting payloads are rejected independently by the server without committed rows", async ({
  api,
}) => {
  const input = await buildStandaloneProjectInput(api, await seedCustomer(api));
  for (const height of [null, "25", "letters", -1]) {
    const name = createUniqueName("Invalid lighting");
    const response = await api.send(HTTP_METHODS.POST, "/project", {
      ...input,
      name,
      hasGeneralLightingCeilingLowering: true,
      generalLightingCeilingLoweringHeight: height,
    });
    expect(response.status()).toBe(400);
    expect(
      await (await api.send(HTTP_METHODS.GET, projectNameAvailabilityPath(name))).json(),
    ).toEqual({ available: true });
  }
  expect(
    (
      await api.send(HTTP_METHODS.POST, "/project", {
        ...input,
        hasGeneralLightingCeilingLowering: true,
      })
    ).status(),
  ).toBe(400);
  expect(
    (
      await api.send(HTTP_METHODS.POST, "/project", {
        ...input,
        hasGeneralLightingCeilingLowering: "true",
        generalLightingCeilingLoweringHeight: 25,
      })
    ).status(),
  ).toBe(400);
});

test("apartments and imports obey global exact-name uniqueness with a localized rejected import row", async ({
  api,
}) => {
  const customer = await seedCustomer(api);
  const first = await seedBuilding(api, customer);
  const second = await seedBuilding(api, customer);
  const number = createApartmentNumber();
  const apartment = await api.createApartment(first.id, {
    customerId: customer.id,
    customerFloor: 1,
    customerApartment: number,
  });
  const duplicate = await api.send(HTTP_METHODS.POST, `/project/${second.id}/apartments`, {
    customerId: customer.id,
    customerFloor: 1,
    customerApartment: number,
  });
  expect(duplicate.status()).toBe(409);
  expect(await duplicate.json()).toMatchObject({ code: PROJECT_CONSTRAINTS.NAME_CONFLICT_CODE });
  const imported = await uploadApartments(api, second.id, [
    buildImportRow(buildCustomerInput(), number),
  ]);
  expect(imported.counts).toEqual({ created: 0, existing: 0, duplicate: 0, error: 1 });
  const rejectedRow = imported.rows[0];
  expect(isRecord(rejectedRow) ? rejectedRow.reason : null).toContain(
    "קיים כבר פרויקט בשם הדירה במערכת",
  );
  expect(await readBuildingApartments(api, second.id)).toHaveLength(0);
  expect((await readProjectConstraints(api, apartment.id)).name).toBe(`דירה ${number}`);
});

test("availability requires the live project-read grant and validates names and exclusion IDs", async ({
  apiAs,
}) => {
  const api = await apiAs(TEST_USERS[USER_ROLES.ENGINEER]);
  const path = projectNameAvailabilityPath(createUniqueName("Permission"));
  await withRolePermissions(USER_ROLES.ENGINEER, [], async () => {
    expect((await api.send(HTTP_METHODS.GET, path)).status()).toBe(403);
  });
  await withRolePermissions(USER_ROLES.ENGINEER, [PERMISSIONS.PROJECTS_READ], async () => {
    expect((await api.send(HTTP_METHODS.GET, path)).status()).toBe(200);
    expect((await api.send(HTTP_METHODS.GET, "/project/name-availability?name=%20")).status()).toBe(
      400,
    );
    expect((await api.send(HTTP_METHODS.GET, `${path}&excludeId=invalid`)).status()).toBe(400);
  });
});
