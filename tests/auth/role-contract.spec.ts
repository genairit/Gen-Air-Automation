import {
  seedUser,
  seedCustomer,
  linkToProject,
  buildUserInput,
  buildTaskInput,
  seedTaskScenario,
  seedStandaloneProject,
  buildStandaloneProjectInput,
} from "../../src/api/seed-data.ts";

import {
  USER_ROLES,
  RETIRED_ROLES,
  NON_MEMBER_ROLES,
  USER_ROLE_VALUES,
  PROJECT_MEMBER_ROLES,
} from "../../src/constants/user-role.constant.ts";

import {
  expectResponseOk,
  expectBadRequest,
} from "../../src/utilities/response-assertion.utility.ts";

import { API_PATHS } from "../../src/constants/api.constant.ts";
import { test, expect } from "../../src/fixtures/test.fixture.ts";
import { HTTP_METHODS } from "../../src/constants/http.constant.ts";
import { createUniqueName } from "../../src/utilities/test-data.utility.ts";
import { assignTaskBypassingApi } from "../../src/environment/legacy-data.ts";
import { buildTaskPath, buildProjectPath } from "../../src/utilities/api-path.utility.ts";

const RENAMED_TASK_PREFIX = "משימה עם אחראי ותיק";

const sortRoles = (roles: readonly string[]) => [...roles].sort();

test("role counts report exactly the six roles", async ({ api }) => {
  const counts = await api.readRoleCounts();

  expect(sortRoles(Object.keys(counts))).toEqual(sortRoles(USER_ROLE_VALUES));
  for (const role of USER_ROLE_VALUES) {
    expect(counts[role]).toBeGreaterThanOrEqual(1);
  }
});

for (const role of USER_ROLE_VALUES) {
  test(`an employee can be created with the ${role} role`, async ({ api }) => {
    const employee = await seedUser(api, role);
    const counts = await api.readRoleCounts();

    expect(employee.role).toBe(role);
    expect(counts[role]).toBeGreaterThanOrEqual(1);
  });
}

test("creating an employee with the retired lead_installer role is rejected", async ({ api }) => {
  const input = { ...buildUserInput(USER_ROLES.INSTALLER), role: RETIRED_ROLES.LEAD_INSTALLER };

  await expectBadRequest(await api.send(HTTP_METHODS.POST, API_PATHS.USER, input));
});

test("a project keeps one member in each of the four member slots", async ({ api }) => {
  const members = await Promise.all(
    PROJECT_MEMBER_ROLES.map(async role => ({ role, userId: (await seedUser(api, role)).id })),
  );
  const input = await buildStandaloneProjectInput(api, await seedCustomer(api), members);
  const project = await api.createProject(input);
  const savedMembers = await api.getProjectMembers(project.id);

  expect(sortRoles(savedMembers.map(member => member.role))).toEqual(
    sortRoles(PROJECT_MEMBER_ROLES),
  );
  expect(savedMembers).toEqual(
    expect.arrayContaining(members.map(member => expect.objectContaining(member))),
  );
});

for (const role of NON_MEMBER_ROLES) {
  test(`${role} is rejected as a project member role on create and update`, async ({ api }) => {
    const member = { role, userId: (await seedUser(api, role)).id };
    const customer = await seedCustomer(api);
    const input = await buildStandaloneProjectInput(api, customer, [member]);
    const project = await seedStandaloneProject(api, customer);

    await expectBadRequest(await api.send(HTTP_METHODS.POST, API_PATHS.PROJECT, input));
    await expectBadRequest(
      await api.send(HTTP_METHODS.PATCH, buildProjectPath(project.id), { members: [member] }),
    );
    expect(await api.getProjectMembers(project.id)).toEqual([]);
  });
}

test("a task can be created for and reassigned to engineers only", async ({ api }) => {
  const { task, project } = await seedTaskScenario(api);
  const link = linkToProject(project);
  const engineer = await seedUser(api, USER_ROLES.ENGINEER);
  const secretary = await seedUser(api, USER_ROLES.SECRETARY);
  const adminId = api.session.user.id;
  const engineerTask = await api.createTask(buildTaskInput({ link, assigneeId: engineer.id }));

  expect((await api.getTask(engineerTask.id)).assigneeId).toBe(engineer.id);

  await expectBadRequest(
    await api.send(
      HTTP_METHODS.POST,
      API_PATHS.TASK,
      buildTaskInput({ link, assigneeId: secretary.id }),
    ),
  );
  for (const assigneeId of [secretary.id, adminId]) {
    await expectBadRequest(
      await api.send(HTTP_METHODS.PATCH, buildTaskPath(task.id), { assigneeId }),
    );
  }

  expect((await api.getTask(task.id)).assigneeId).toBeNull();
});

test("a task that keeps a legacy non-engineer assignee can still be edited", async ({ api }) => {
  const { task } = await seedTaskScenario(api);
  const legacyAssignee = await seedUser(api, USER_ROLES.INSTALLER);
  const title = createUniqueName(RENAMED_TASK_PREFIX);

  await assignTaskBypassingApi(task.id, legacyAssignee.id);

  const titleUpdate = await api.send(HTTP_METHODS.PATCH, buildTaskPath(task.id), { title });
  const unchangedAssigneeUpdate = await api.send(HTTP_METHODS.PATCH, buildTaskPath(task.id), {
    title,
    assigneeId: legacyAssignee.id,
  });

  await expectResponseOk(titleUpdate);
  await expectResponseOk(unchangedAssigneeUpdate);
  expect(await api.getTask(task.id)).toMatchObject({ title, assigneeId: legacyAssignee.id });
});
