import {
  seedUser,
  seedCustomer,
  linkToProject,
  buildUserInput,
  buildTaskInput,
  seedTaskScenario,
  seedStandaloneProject,
} from "../../src/api/seed-data.ts";

import { API_PATHS } from "../../src/constants/api.constant.ts";
import { test, expect } from "../../src/fixtures/api.fixture.ts";
import { HTTP_METHODS } from "../../src/constants/http.constant.ts";
import { USER_ROLES } from "../../src/constants/user-role.constant.ts";
import { TEST_USERS } from "../../src/constants/test-users.constant.ts";
import { PROJECT_STATUS_NAMES } from "../../src/constants/domain.constant.ts";
import { withRolePermissions } from "../../src/environment/role-permissions.ts";
import { createTestDatabaseClient } from "../../src/environment/test-database-client.ts";
import { BASELINE_PERMISSIONS } from "../../src/constants/permission-baseline.constant.ts";
import { PERMISSIONS, PERMISSION_VALUES } from "../../src/constants/permission.constant.ts";

const ADMIN = USER_ROLES.SYSTEM_ADMIN;
const FINANCE = USER_ROLES.FINANCE;
const ME = "/user/me";

for (const role of Object.values(USER_ROLES)) {
  test(`${role} login and current user expose matching public identity and current grants`, async ({
    apiAs,
  }) => {
    const actor = await apiAs(TEST_USERS[role]);
    const response = await actor.send(HTTP_METHODS.GET, ME);
    expect(response.status()).toBe(200);
    const user = await response.json();
    expect(user).toEqual(actor.session.user);
    expect(user).toMatchObject({ role, email: TEST_USERS[role].email });
    expect([...user.permissions].sort()).toEqual([...BASELINE_PERMISSIONS[role]].sort());
    expect(
      user.permissions.every((key: string) =>
        PERMISSION_VALUES.some(registered => registered === key),
      ),
    ).toBe(true);
    expect(user).not.toHaveProperty("passwordHash");
    expect(user).not.toHaveProperty("dataValues");
    const claims = JSON.parse(
      Buffer.from(actor.session.accessToken.split(".")[1], "base64url").toString(),
    );
    expect(claims).not.toHaveProperty("permissions");
    expect(claims).not.toHaveProperty("role");
  });
}

test("same token immediately follows grants added and removed without a role fallback", async ({
  apiAs,
}) => {
  const actor = await apiAs(TEST_USERS[FINANCE]);
  await withRolePermissions(FINANCE, [], async () => {
    expect((await actor.send(HTTP_METHODS.GET, API_PATHS.CUSTOMER)).status()).toBe(403);
    expect(await (await actor.send(HTTP_METHODS.GET, ME)).json()).toMatchObject({
      permissions: [],
    });
    await withRolePermissions(FINANCE, [PERMISSIONS.CUSTOMERS_READ], async () => {
      expect((await actor.send(HTTP_METHODS.GET, API_PATHS.CUSTOMER)).status()).toBe(200);
      expect(await (await actor.send(HTTP_METHODS.GET, ME)).json()).toMatchObject({
        permissions: [PERMISSIONS.CUSTOMERS_READ],
      });
    });
    expect((await actor.send(HTTP_METHODS.GET, API_PATHS.CUSTOMER)).status()).toBe(403);
  });
});

test("system admin with zero grants retains self service but has no implicit bypass", async ({
  api,
}) => {
  await withRolePermissions(ADMIN, [], async () => {
    expect((await api.send(HTTP_METHODS.GET, ME)).status()).toBe(200);
    for (const path of [API_PATHS.PROJECT, API_PATHS.CUSTOMER, API_PATHS.TASK, API_PATHS.USER]) {
      expect((await api.send(HTTP_METHODS.GET, path)).status()).toBe(403);
    }
    expect((await api.send(HTTP_METHODS.POST, API_PATHS.CUSTOMER, {})).status()).toBe(403);
  });
});

test("unregistered database keys never become effective session grants", async ({ apiAs }) => {
  const database = createTestDatabaseClient();
  await database.connect();
  try {
    await database.query(
      "INSERT INTO permissions(key, feature, action) VALUES ('qa.unregistered', 'qa', 'unregistered')",
    );
    await withRolePermissions(FINANCE, ["qa.unregistered"], async () => {
      const actor = await apiAs(TEST_USERS[FINANCE]);
      expect(actor.session.user.permissions).toEqual([]);
      expect((await actor.send(HTTP_METHODS.GET, API_PATHS.CUSTOMER)).status()).toBe(403);
    });
  } finally {
    await database.query("DELETE FROM permissions WHERE key = 'qa.unregistered'");
    await database.end();
  }
});

test("task content grant cannot assign on create/update or change urgency", async ({ api }) => {
  const customer = await seedCustomer(api);
  const engineer = await seedUser(api, USER_ROLES.ENGINEER);
  const { task } = await seedTaskScenario(api);
  const project = await seedStandaloneProject(api, customer);
  const input = buildTaskInput({ link: linkToProject(project) });
  await withRolePermissions(
    ADMIN,
    [PERMISSIONS.TASKS_CREATE, PERMISSIONS.TASKS_UPDATE, PERMISSIONS.TASKS_READ],
    async () => {
      expect((await api.send(HTTP_METHODS.POST, API_PATHS.TASK, input)).status()).toBe(201);
      expect(
        (
          await api.send(HTTP_METHODS.POST, API_PATHS.TASK, { ...input, assigneeId: engineer.id })
        ).status(),
      ).toBe(403);
      expect(
        (
          await api.send(HTTP_METHODS.PATCH, `/task/${task.id}`, {
            description: "Content-only update",
          })
        ).status(),
      ).toBe(200);
      for (const assigneeId of [engineer.id, null]) {
        expect(
          (await api.send(HTTP_METHODS.PATCH, `/task/${task.id}`, { assigneeId })).status(),
        ).toBe(403);
      }
      expect(
        (
          await api.send(HTTP_METHODS.PATCH, `/task/${task.id}/urgency`, { isUrgent: true })
        ).status(),
      ).toBe(403);
      expect(await api.getTask(task.id)).toMatchObject({
        assigneeId: null,
        description: "Content-only update",
      });
    },
  );
});

test("employee content grant cannot create an account or change its role", async ({ api }) => {
  const employee = await seedUser(api, USER_ROLES.ENGINEER);
  await withRolePermissions(
    ADMIN,
    [PERMISSIONS.EMPLOYEES_CREATE, PERMISSIONS.EMPLOYEES_UPDATE, PERMISSIONS.EMPLOYEES_READ],
    async () => {
      expect(
        (await api.send(HTTP_METHODS.POST, API_PATHS.USER, buildUserInput(FINANCE))).status(),
      ).toBe(403);
      expect(
        (
          await api.send(HTTP_METHODS.PATCH, `/user/${employee.id}`, { firstName: "Edited" })
        ).status(),
      ).toBe(200);
      expect(
        (await api.send(HTTP_METHODS.PATCH, `/user/${employee.id}`, { role: ADMIN })).status(),
      ).toBe(403);
      expect(await (await api.send(HTTP_METHODS.GET, `/user/${employee.id}`)).json()).toMatchObject(
        { role: USER_ROLES.ENGINEER, firstName: "Edited" },
      );
    },
  );
});

test("project update cannot smuggle stageId without the status grant", async ({ api }) => {
  const { project } = await seedTaskScenario(api);
  const stage = await api.findProjectStage(PROJECT_STATUS_NAMES.IN_PROGRESS);
  await withRolePermissions(
    ADMIN,
    [PERMISSIONS.PROJECTS_READ, PERMISSIONS.PROJECTS_UPDATE],
    async () => {
      expect(
        (
          await api.send(HTTP_METHODS.PATCH, `/project/${project.id}`, { name: "Ordinary edit" })
        ).status(),
      ).toBe(200);
      expect(
        (
          await api.send(HTTP_METHODS.PATCH, `/project/${project.id}`, {
            stageId: stage.id,
            name: "Forbidden edit",
          })
        ).status(),
      ).toBe(403);
      expect(
        (
          await api.send(HTTP_METHODS.PATCH, `/project/${project.id}/stage`, { stageId: stage.id })
        ).status(),
      ).toBe(403);
      expect(
        await (await api.send(HTTP_METHODS.GET, `/project/${project.id}`)).json(),
      ).toMatchObject({ name: "Ordinary edit" });
    },
  );
});

test("granting claim to an unqualified role cannot bypass engineer eligibility", async ({
  api,
  apiAs,
}) => {
  const { task } = await seedTaskScenario(api);
  const actor = await apiAs(TEST_USERS[FINANCE]);
  await withRolePermissions(FINANCE, [PERMISSIONS.TASKS_CLAIM], async () => {
    expect((await actor.send(HTTP_METHODS.PATCH, `/task/${task.id}/claim`)).status()).toBe(400);
  });
  expect(await api.getTask(task.id)).toMatchObject({ assigneeId: null });
});

test("personal task queries cannot substitute another assignee even with broad feature read", async ({
  api,
  apiAs,
}) => {
  const actor = await apiAs(TEST_USERS[USER_ROLES.ENGINEER]);
  const other = await seedUser(api, USER_ROLES.ENGINEER);
  const customer = await seedCustomer(api);
  const project = await seedStandaloneProject(api, customer);
  const own = await api.createTask(
    buildTaskInput({ link: linkToProject(project), assigneeId: actor.session.user.id }),
  );
  await api.createTask(buildTaskInput({ link: linkToProject(project), assigneeId: other.id }));
  const response = await actor.send(HTTP_METHODS.GET, `/task/my-tasks?assigneeId=${other.id}`);
  expect(response.status()).toBe(200);
  const result = await response.json();
  expect(result.items.map((task: { id: string }) => task.id)).toContain(own.id);
  expect(
    result.items.every((task: { assigneeId: string }) => task.assigneeId === actor.session.user.id),
  ).toBe(true);
});

test("each Drive action denies before integration access when its grant is absent", async ({
  api,
  apiAs,
}) => {
  const { project } = await seedTaskScenario(api);
  const actor = await apiAs(TEST_USERS[FINANCE]);
  await withRolePermissions(FINANCE, [], async () => {
    const operations = [
      { method: HTTP_METHODS.GET, path: `/project-drive/${project.id}/contents` },
      { method: HTTP_METHODS.POST, path: `/project-drive/${project.id}/files` },
      { method: HTTP_METHODS.PATCH, path: `/project-drive/${project.id}/files/test-file` },
      { method: HTTP_METHODS.DELETE, path: `/project-drive/${project.id}/files/test-file` },
      { method: HTTP_METHODS.POST, path: `/project-drive/${project.id}/provision` },
      { method: HTTP_METHODS.GET, path: "/project-drive/connection" },
    ];
    for (const operation of operations) {
      expect((await actor.send(operation.method, operation.path)).status()).toBe(403);
    }
  });
});

test("disposable grant helper rolls back invalid keys and preserves the original grants", async ({
  apiAs,
}) => {
  const before = (await apiAs(TEST_USERS[FINANCE])).session.user.permissions;
  await expect(
    withRolePermissions(FINANCE, ["qa.unknown-key"], async () => {
      throw new Error("Invalid grants must not reach the callback");
    }),
  ).rejects.toThrow(/foreign key constraint/);
  const after = (await apiAs(TEST_USERS[FINANCE])).session.user.permissions;
  expect(after).toEqual(before);
});

test("disposable grant helper restores original grants and rethrows a failing callback", async ({
  apiAs,
}) => {
  const before = (await apiAs(TEST_USERS[FINANCE])).session.user.permissions;
  const failure = new Error("Expected callback failure for cleanup coverage");
  await expect(
    withRolePermissions(FINANCE, [], async () => {
      expect((await apiAs(TEST_USERS[FINANCE])).session.user.permissions).toEqual([]);
      throw failure;
    }),
  ).rejects.toBe(failure);
  const after = (await apiAs(TEST_USERS[FINANCE])).session.user.permissions;
  expect(after).toEqual(before);
});
