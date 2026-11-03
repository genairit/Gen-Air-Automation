import {
  seedCustomer,
  linkToProject,
  buildUserInput,
  buildTaskInput,
  seedStandaloneProject,
  buildStandaloneProjectInput,
} from "../../src/api/seed-data.ts";

import {
  USER_ROLES,
  RETIRED_ROLES,
  USER_ROLE_VALUES,
} from "../../src/constants/user-role.constant.ts";

import {
  ROLE_AUDIT_ACTIONS,
  type RoleAuditActionType,
} from "../../src/constants/multiple-roles.constant.ts";

import { API_PATHS } from "../../src/constants/api.constant.ts";
import { test, expect } from "../../src/fixtures/test.fixture.ts";
import { HTTP_METHODS } from "../../src/constants/http.constant.ts";
import { buildUserPath } from "../../src/utilities/api-path.utility.ts";
import { seedMultiRoleUser, switchRole } from "../../src/api/multi-role.ts";
import { createTestDatabaseClient } from "../../src/environment/test-database-client.ts";

const ADMIN = USER_ROLES.SYSTEM_ADMIN;
const FINANCE = USER_ROLES.FINANCE;
const ENGINEER = USER_ROLES.ENGINEER;

test("six assigned roles persist, but the original JWT grants only the current active role", async ({
  api,
  apiAs,
}) => {
  const user = await seedMultiRoleUser(api, USER_ROLE_VALUES);
  const actor = await apiAs(user);
  const before = await actor.send(HTTP_METHODS.GET, API_PATHS.USER);
  expect(before.status()).toBe(200);
  expect([...actor.session.user.assignedRoles].sort()).toEqual([...USER_ROLE_VALUES].sort());

  const switched = await switchRole(actor, FINANCE);
  expect(switched.status()).toBe(200);
  expect(await switched.json()).toMatchObject({
    role: FINANCE,
    assignedRoles: expect.arrayContaining(USER_ROLE_VALUES),
  });
  expect(
    (await actor.send(HTTP_METHODS.POST, API_PATHS.USER, buildUserInput(ENGINEER))).status(),
  ).toBe(403);
  const me = await actor.send(HTTP_METHODS.GET, API_PATHS.MY_USER);
  const finance = await apiAs(await seedMultiRoleUser(api, [FINANCE]));
  expect(await me.json()).toMatchObject({
    role: FINANCE,
    permissions: finance.session.user.permissions,
  });
  const relogin = await apiAs(user);
  expect(relogin.session.user.role).toBe(FINANCE);
  expect((await switchRole(actor, ADMIN)).status()).toBe(200);
  expect((await actor.send(HTTP_METHODS.GET, API_PATHS.USER)).status()).toBe(200);
});

for (const assignedRoles of [
  [],
  [ENGINEER, ENGINEER],
  ["invented"],
  [RETIRED_ROLES.LEAD_INSTALLER],
]) {
  test(`invalid role assignments are rejected: ${JSON.stringify(assignedRoles)}`, async ({
    api,
  }) => {
    const response = await api.send(HTTP_METHODS.POST, API_PATHS.USER, {
      ...buildUserInput(ENGINEER),
      assignedRoles,
    });
    expect(response.status()).toBe(400);
    const user = await seedMultiRoleUser(api, [ENGINEER]);
    const update = await api.send(HTTP_METHODS.PATCH, buildUserPath(user.id), { assignedRoles });
    expect(update.status()).toBe(400);
    expect(await (await api.send(HTTP_METHODS.GET, buildUserPath(user.id))).json()).toMatchObject({
      role: ENGINEER,
      assignedRoles: [ENGINEER],
    });
  });
}

test("create and edit reject an explicit active role and derive it from assignments", async ({
  api,
}) => {
  const input = { ...buildUserInput(ENGINEER), assignedRoles: [FINANCE, ENGINEER] };
  const rejectedCreate = await api.send(HTTP_METHODS.POST, API_PATHS.USER, {
    ...input,
    role: ENGINEER,
  });
  expect(rejectedCreate.status()).toBe(400);

  const created = await api.createUser(input);
  expect(created).toMatchObject({
    role: FINANCE,
    assignedRoles: expect.arrayContaining([FINANCE, ENGINEER]),
  });

  const rejectedEdit = await api.send(HTTP_METHODS.PATCH, buildUserPath(created.id), {
    role: ENGINEER,
    assignedRoles: [FINANCE, ENGINEER],
  });
  expect(rejectedEdit.status()).toBe(400);

  const preserved = await api.send(HTTP_METHODS.PATCH, buildUserPath(created.id), {
    assignedRoles: [ENGINEER, FINANCE],
  });
  expect(preserved.status()).toBe(200);
  expect(await preserved.json()).toMatchObject({ role: FINANCE });

  const fallback = await api.send(HTTP_METHODS.PATCH, buildUserPath(created.id), {
    assignedRoles: [ENGINEER],
  });
  expect(fallback.status()).toBe(200);
  expect(await fallback.json()).toMatchObject({ role: ENGINEER, assignedRoles: [ENGINEER] });
});

test("assignment changes and switches retain durable actor-role audit snapshots", async ({
  api,
  apiAs,
}) => {
  const user = await seedMultiRoleUser(api, [ENGINEER]);
  expect(
    (
      await api.send(HTTP_METHODS.PATCH, buildUserPath(user.id), {
        assignedRoles: [ENGINEER, FINANCE],
      })
    ).status(),
  ).toBe(200);
  const actor = await apiAs(user);
  expect((await switchRole(actor, FINANCE)).status()).toBe(200);
  const database = createTestDatabaseClient();
  await database.connect();
  try {
    const audits = await database.query<{
      action: RoleAuditActionType;
      actor_id: string;
      actor_role: string;
      previous_role: string;
      next_role: string;
      previous_assigned_roles: string[];
      next_assigned_roles: string[];
    }>(
      `SELECT action, actor_id, actor_role, previous_role, next_role,
        previous_assigned_roles, next_assigned_roles
       FROM user_role_audits WHERE subject_user_id = $1 ORDER BY created_at`,
      [user.id],
    );
    expect(audits.rows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          action: ROLE_AUDIT_ACTIONS.ASSIGNMENT,
          actor_id: api.session.user.id,
          actor_role: ADMIN,
          previous_assigned_roles: [ENGINEER],
          next_assigned_roles: expect.arrayContaining([ENGINEER, FINANCE]),
        }),
        expect.objectContaining({
          action: ROLE_AUDIT_ACTIONS.SWITCH,
          actor_id: user.id,
          actor_role: ENGINEER,
          previous_role: ENGINEER,
          next_role: FINANCE,
        }),
      ]),
    );
  } finally {
    await database.end();
  }
});

test("active role must be assigned; unassigned and arbitrary switching cannot self-grant", async ({
  api,
  apiAs,
}) => {
  const user = await seedMultiRoleUser(api, [ENGINEER, FINANCE]);
  const actor = await apiAs(user);
  for (const role of [ADMIN, "invented", RETIRED_ROLES.LEAD_INSTALLER, ""]) {
    expect((await switchRole(actor, role)).status()).toBe(400);
  }
  const grant = await actor.send(HTTP_METHODS.PATCH, buildUserPath(user.id), {
    role: ADMIN,
    assignedRoles: [ADMIN, ENGINEER],
  });
  expect(grant.status()).toBe(403);
  expect(
    (await actor.send(HTTP_METHODS.POST, API_PATHS.USER, buildUserInput(ADMIN))).status(),
  ).toBe(403);
  const invalidActive = await api.send(HTTP_METHODS.PATCH, buildUserPath(user.id), {
    role: ADMIN,
    assignedRoles: [ENGINEER],
  });
  expect(invalidActive.status()).toBe(400);
  const me = await actor.send(HTTP_METHODS.GET, API_PATHS.MY_USER);
  expect(await me.json()).toMatchObject({
    role: ENGINEER,
    assignedRoles: expect.arrayContaining([ENGINEER, FINANCE]),
  });
});

test("active-role revocation immediately replaces old-token permissions and rejects revoked selection", async ({
  api,
  apiAs,
}) => {
  const user = await seedMultiRoleUser(api, [ADMIN, FINANCE]);
  const actor = await apiAs(user);
  const updated = await api.send(HTTP_METHODS.PATCH, buildUserPath(user.id), {
    assignedRoles: [FINANCE],
  });
  expect(updated.status()).toBe(200);
  expect(await updated.json()).toMatchObject({ role: FINANCE, assignedRoles: [FINANCE] });
  expect(
    (await actor.send(HTTP_METHODS.POST, API_PATHS.USER, buildUserInput(ENGINEER))).status(),
  ).toBe(403);
  expect((await switchRole(actor, ADMIN)).status()).toBe(400);
  expect((await apiAs(user)).session.user.role).toBe(FINANCE);
});

test("engineer eligibility and personal tasks follow assignments and account, not active role", async ({
  api,
  apiAs,
}) => {
  const user = await seedMultiRoleUser(api, [FINANCE, ENGINEER]);
  const actor = await apiAs(user);
  const customer = await seedCustomer(api);
  const members = [{ userId: user.id, role: ENGINEER }];
  const project = await api.createProject(
    await buildStandaloneProjectInput(api, customer, members),
  );
  expect(await api.getProjectMembers(project.id)).toEqual(
    expect.arrayContaining([expect.objectContaining(members[0])]),
  );
  const picker = await api.send(
    HTTP_METHODS.GET,
    `${API_PATHS.USER}?${new URLSearchParams({ role: ENGINEER, search: user.email })}`,
  );
  expect(picker.status()).toBe(200);
  expect(await picker.json()).toMatchObject({ items: [expect.objectContaining({ id: user.id })] });
  const task = await api.createTask(
    buildTaskInput({
      link: linkToProject(project),
      assigneeId: user.id,
    }),
  );
  const unrelated = await seedStandaloneProject(api, customer);
  const otherTask = await api.createTask(buildTaskInput({ link: linkToProject(unrelated) }));
  const before = await actor.findTaskIds({ assigneeId: user.id });
  expect(before).toContain(task.id);
  expect(before).not.toContain(otherTask.id);
  expect((await switchRole(actor, ENGINEER)).status()).toBe(200);
  expect(await actor.findTaskIds({ assigneeId: user.id })).toEqual(before);
  expect((await api.getTask(task.id)).assigneeId).toBe(user.id);
});
