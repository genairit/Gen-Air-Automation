import {
  seedUser,
  seedBuilding,
  seedCustomer,
  seedApartment,
  buildProjectInput,
  seedStandaloneProject,
} from "../../src/api/seed-data.ts";

import type { TGenAirApi } from "../../src/api/gen-air-api.ts";
import { isRecord } from "../../src/utilities/guard.utility.ts";
import { test, expect } from "../../src/fixtures/api.fixture.ts";
import { USER_ROLES } from "../../src/constants/user-role.constant.ts";
import { PROJECT_TYPE_NAMES } from "../../src/constants/domain.constant.ts";
import { HTTP_METHODS, HTTP_STATUS } from "../../src/constants/http.constant.ts";
import { createApartmentNumber } from "../../src/utilities/apartment-fixture.utility.ts";
import { buildProjectPath, buildApartmentsPath } from "../../src/utilities/api-path.utility.ts";

const readTeam = async (api: TGenAirApi, projectId: string) => {
  const response = await api.send(HTTP_METHODS.GET, buildProjectPath(projectId));
  expect(response.ok()).toBe(true);
  const project: unknown = await response.json();
  if (!isRecord(project) || !Array.isArray(project.members)) {
    throw new Error("Expected a project team");
  }
  return { hasOwnTeam: project.hasOwnTeam, members: project.members };
};

test("residential buildings reject engineer assignment while other roles and standalone engineers remain valid", async ({
  api,
}) => {
  const customer = await seedCustomer(api);
  const engineer = await seedUser(api, USER_ROLES.ENGINEER);
  const secretary = await seedUser(api, USER_ROLES.SECRETARY);
  const residential = await api.findProjectType(PROJECT_TYPE_NAMES.RESIDENTIAL_BUILDING);
  const attempted = buildProjectInput({ customer, projectTypeId: residential.id });
  expect(
    (
      await api.send(HTTP_METHODS.POST, "/project", {
        ...attempted,
        members: [{ userId: engineer.id, role: USER_ROLES.ENGINEER }],
      })
    ).status(),
  ).toBe(HTTP_STATUS.BAD_REQUEST);

  const building = await seedBuilding(api, customer);
  expect(
    (
      await api.send(HTTP_METHODS.PATCH, buildProjectPath(building.id), {
        members: [{ userId: engineer.id, role: USER_ROLES.ENGINEER }],
      })
    ).status(),
  ).toBe(HTTP_STATUS.BAD_REQUEST);
  expect(
    (
      await api.send(HTTP_METHODS.PATCH, buildProjectPath(building.id), {
        engineerUserId: engineer.id,
      })
    ).status(),
  ).toBe(HTTP_STATUS.BAD_REQUEST);
  const otherRole = await api.send(HTTP_METHODS.PATCH, buildProjectPath(building.id), {
    members: [{ userId: secretary.id, role: USER_ROLES.SECRETARY }],
  });
  expect(otherRole.ok()).toBe(true);
  expect(await api.getProjectMembers(building.id)).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ userId: secretary.id, role: USER_ROLES.SECRETARY }),
    ]),
  );
  expect(await api.getProjectMembers(building.id)).toHaveLength(1);

  const standalone = await seedStandaloneProject(api, customer);
  const standaloneAssignment = await api.send(HTTP_METHODS.PATCH, buildProjectPath(standalone.id), {
    members: [{ userId: engineer.id, role: USER_ROLES.ENGINEER }],
  });
  expect(standaloneAssignment.ok()).toBe(true);
  expect(await api.getProjectMembers(standalone.id)).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ userId: engineer.id, role: USER_ROLES.ENGINEER }),
    ]),
  );
});

test("apartment engineer stays local while other roles inherit, override and reset", async ({
  api,
}) => {
  const building = await seedBuilding(api, await seedCustomer(api));
  const firstEngineer = await seedUser(api, USER_ROLES.ENGINEER);
  const secondEngineer = await seedUser(api, USER_ROLES.ENGINEER);
  const secretary = await seedUser(api, USER_ROLES.SECRETARY);
  const installer = await seedUser(api, USER_ROLES.INSTALLER);
  expect(
    (
      await api.send(HTTP_METHODS.PATCH, buildProjectPath(building.id), {
        members: [{ userId: secretary.id, role: USER_ROLES.SECRETARY }],
      })
    ).ok(),
  ).toBe(true);

  const apartment = await api.createApartment(building.id, {
    customerId: (await seedCustomer(api)).id,
    customerFloor: 3,
    customerApartment: createApartmentNumber(),
    engineerUserId: firstEngineer.id,
  });
  expect(await readTeam(api, apartment.id)).toMatchObject({ hasOwnTeam: false });
  expect((await readTeam(api, apartment.id)).members).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ userId: firstEngineer.id, role: USER_ROLES.ENGINEER }),
      expect.objectContaining({ userId: secretary.id, role: USER_ROLES.SECRETARY }),
    ]),
  );

  expect(
    (
      await api.send(HTTP_METHODS.PATCH, buildProjectPath(building.id), {
        members: [{ userId: installer.id, role: USER_ROLES.INSTALLER }],
      })
    ).ok(),
  ).toBe(true);
  expect((await readTeam(api, apartment.id)).members).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ userId: firstEngineer.id, role: USER_ROLES.ENGINEER }),
      expect.objectContaining({ userId: installer.id, role: USER_ROLES.INSTALLER }),
    ]),
  );

  expect(
    (
      await api.send(HTTP_METHODS.PATCH, buildProjectPath(apartment.id), {
        hasOwnTeam: true,
        members: [{ userId: secretary.id, role: USER_ROLES.SECRETARY }],
        engineerUserId: secondEngineer.id,
      })
    ).ok(),
  ).toBe(true);
  expect((await readTeam(api, apartment.id)).members).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ userId: secondEngineer.id, role: USER_ROLES.ENGINEER }),
      expect.objectContaining({ userId: secretary.id, role: USER_ROLES.SECRETARY }),
    ]),
  );
  expect(
    (
      await api.send(HTTP_METHODS.PATCH, buildProjectPath(apartment.id), {
        hasOwnTeam: false,
      })
    ).ok(),
  ).toBe(true);
  const reset = await readTeam(api, apartment.id);
  expect(reset.hasOwnTeam).toBe(false);
  expect(reset.members).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ userId: secondEngineer.id, role: USER_ROLES.ENGINEER }),
      expect.objectContaining({ userId: installer.id, role: USER_ROLES.INSTALLER }),
    ]),
  );
  expect(reset.members).toHaveLength(2);
  expect(
    (
      await api.send(HTTP_METHODS.PATCH, buildProjectPath(apartment.id), {
        engineerUserId: null,
      })
    ).ok(),
  ).toBe(true);
  expect((await readTeam(api, apartment.id)).members).toEqual([
    expect.objectContaining({ userId: installer.id, role: USER_ROLES.INSTALLER }),
  ]);
});

test("apartment API rejects ineligible engineer and new apartments start without an engineer", async ({
  api,
}) => {
  const building = await seedBuilding(api, await seedCustomer(api));
  const ineligible = await seedUser(api, USER_ROLES.SECRETARY);
  const customer = await seedCustomer(api);
  const create = await api.send(HTTP_METHODS.POST, buildApartmentsPath(building.id), {
    customerId: customer.id,
    customerFloor: 2,
    customerApartment: createApartmentNumber(),
    engineerUserId: ineligible.id,
  });
  expect(create.status()).toBe(HTTP_STATUS.BAD_REQUEST);
  const apartment = await seedApartment(api, building);
  expect(
    (
      await api.send(HTTP_METHODS.PATCH, buildProjectPath(apartment.id), {
        engineerUserId: ineligible.id,
      })
    ).status(),
  ).toBe(HTTP_STATUS.BAD_REQUEST);
  expect((await readTeam(api, apartment.id)).members).toEqual([]);
});
