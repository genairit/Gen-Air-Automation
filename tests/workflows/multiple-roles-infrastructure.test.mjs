import {
  USER_ROLES,
  RETIRED_ROLES,
  USER_ROLE_VALUES,
} from "../../src/constants/user-role.constant.ts";

import {
  isUserRecord,
  isAssignedRoles,
  isAuthorizedUser,
} from "../../src/utilities/entity-guard.utility.ts";

import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readPort } from "../../src/utilities/port.utility.ts";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { MIGRATION_STAGES } from "../../src/constants/migration.constant.ts";
import { applyStagedMigrations } from "../../src/environment/staged-migrations.ts";

const PORT_ENVIRONMENT = [
  "GEN_AIR_BACKEND_PORT",
  "GEN_AIR_FRONTEND_PORT",
  "GEN_AIR_DATABASE_PORT",
  "GEN_AIR_FAKE_PLACES_PORT",
  "GEN_AIR_SMTP_PORT",
  "GEN_AIR_QA_PORT_OFFSET",
];
const environmentModule = new URL("../../src/constants/environment.constant.ts", import.meta.url)
  .href;
const runEnvironmentProbe = overrides => {
  const environment = Object.fromEntries(
    Object.entries(process.env).filter(([key]) => !PORT_ENVIRONMENT.includes(key)),
  );
  return spawnSync(
    process.execPath,
    [
      "--input-type=module",
      "-e",
      `import { PORTS } from ${JSON.stringify(environmentModule)}; console.log(JSON.stringify(PORTS));`,
    ],
    { encoding: "utf8", env: { ...environment, ...overrides } },
  );
};
const readConfiguredPorts = overrides => {
  const child = runEnvironmentProbe(overrides);
  assert.equal(child.status, 0, child.stderr);
  return JSON.parse(child.stdout);
};

test("configured ports keep established defaults and accept all five isolated overrides", () => {
  assert.deepEqual(readConfiguredPorts({}), {
    BACKEND: 3100,
    FRONTEND: 5180,
    DATABASE: 54329,
    FAKE_PLACES: 4100,
    SMTP: 2525,
  });
  assert.deepEqual(
    readConfiguredPorts(
      Object.fromEntries(
        PORT_ENVIRONMENT.filter(key => key !== "GEN_AIR_QA_PORT_OFFSET").map((key, index) => [
          key,
          String(6000 + index),
        ]),
      ),
    ),
    { BACKEND: 6000, FRONTEND: 6001, DATABASE: 6002, FAKE_PLACES: 6003, SMTP: 6004 },
  );
});

for (const offset of ["invalid", "0.5", "20000", "-5000"]) {
  test(`invalid or out-of-range resolved dev offset rejects ${offset}`, () => {
    const child = runEnvironmentProbe({ GEN_AIR_QA_PORT_OFFSET: offset });
    assert.notEqual(child.status, 0);
    assert.match(child.stderr, /must be an integer port between 1024 and 65535/);
  });
}

test("dev port offset applies to every service while explicit role overrides take precedence", () => {
  assert.deepEqual(readConfiguredPorts({ GEN_AIR_QA_PORT_OFFSET: "100" }), {
    BACKEND: 3200,
    FRONTEND: 5280,
    DATABASE: 54429,
    FAKE_PLACES: 4200,
    SMTP: 2625,
  });
  assert.deepEqual(
    readConfiguredPorts({
      GEN_AIR_QA_PORT_OFFSET: "100",
      GEN_AIR_BACKEND_PORT: "3218",
      GEN_AIR_SMTP_PORT: "2626",
    }),
    { BACKEND: 3218, FRONTEND: 5280, DATABASE: 54429, FAKE_PLACES: 4200, SMTP: 2626 },
  );
});

for (const value of ["", "invalid", "1023", "65536", "1.5", "Infinity", "-1"]) {
  test(`port validation rejects ${JSON.stringify(value)}`, () =>
    assert.throws(() => readPort("QA_PORT", value, 3100), /QA_PORT must be an integer port/));
}

test("port validation accepts inclusive bounds and a missing override", () => {
  assert.equal(readPort("QA_PORT", null, 3100), 3100);
  assert.equal(readPort("QA_PORT", "1024", 3100), 1024);
  assert.equal(readPort("QA_PORT", "65535", 3100), 65535);
});

const account = assignedRoles => ({
  id: "qa-account",
  email: "qa@example.test",
  firstName: "QA",
  lastName: "Roles",
  role: USER_ROLE_VALUES[0],
  permissions: [],
  assignedRoles,
});

test("both account guards accept each catalog membership and all six roles", () => {
  for (const assignedRoles of [...USER_ROLE_VALUES.map(role => [role]), USER_ROLE_VALUES]) {
    assert.equal(isAssignedRoles(assignedRoles), true);
    assert.equal(isUserRecord(account(assignedRoles)), true);
    assert.equal(isAuthorizedUser(account(assignedRoles)), true);
  }
});

for (const assignedRoles of [
  ["invented"],
  [RETIRED_ROLES.LEAD_INSTALLER],
  [],
  null,
  [USER_ROLES.ENGINEER, USER_ROLES.ENGINEER],
  [12],
  USER_ROLES.ENGINEER,
]) {
  test(`both account guards reject invalid memberships ${JSON.stringify(assignedRoles)}`, () => {
    assert.equal(isAssignedRoles(assignedRoles), false);
    assert.equal(isUserRecord(account(assignedRoles)), false);
    assert.equal(isAuthorizedUser(account(assignedRoles)), false);
  });
}

test("account guards reject absent assignments and malformed authorization permissions", () => {
  const { assignedRoles, ...legacy } = account(USER_ROLE_VALUES);
  assert.equal(assignedRoles.length, 6);
  assert.equal(isUserRecord(legacy), false);
  assert.equal(isAuthorizedUser(legacy), false);
  assert.equal(isAuthorizedUser({ ...account(USER_ROLE_VALUES), permissions: [42] }), false);
});

const withMigrationDirectory = async run => {
  const directory = await mkdtemp(join(tmpdir(), "genair-role-stage-contract-"));
  try {
    await run(directory);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
};

const seedStages = async (directory, sprint) => {
  await mkdir(join(directory, sprint));
  for (const stage of Object.values(MIGRATION_STAGES)) {
    await writeFile(join(directory, sprint, stage), `${sprint}:${stage}`);
  }
};

test("staged loader orders sprints and stages, committing each stage and ignoring non-sprints", () =>
  withMigrationDirectory(async directory => {
    await seedStages(directory, "sprint-z");
    await seedStages(directory, "sprint-a");
    await mkdir(join(directory, "unrelated"));
    await writeFile(join(directory, "sprint-not-a-directory"), "ignored");
    const calls = [];
    await applyStagedMigrations(directory, { query: async sql => calls.push(sql) });
    assert.deepEqual(
      calls,
      ["sprint-a", "sprint-z"].flatMap(sprint =>
        Object.values(MIGRATION_STAGES).flatMap(stage => [`${sprint}:${stage}`, "COMMIT"]),
      ),
    );
  }));

test("staged loader rolls back a failed stage, propagates its error and does not continue", () =>
  withMigrationDirectory(async directory => {
    await seedStages(directory, "sprint-a");
    await seedStages(directory, "sprint-z");
    const failure = new Error("QA migration failed");
    const calls = [];
    await assert.rejects(
      applyStagedMigrations(directory, {
        query: async sql => {
          calls.push(sql);
          if (sql.endsWith(MIGRATION_STAGES.AFTER_DEPLOY)) {
            throw failure;
          }
        },
      }),
      error => error === failure,
    );
    assert.deepEqual(calls, [
      `sprint-a:${MIGRATION_STAGES.BEFORE_DEPLOY}`,
      "COMMIT",
      `sprint-a:${MIGRATION_STAGES.AFTER_DEPLOY}`,
      "ROLLBACK",
    ]);
  }));

test("staged loader rejects missing stage files instead of silently omitting them", () =>
  withMigrationDirectory(async directory => {
    await mkdir(join(directory, "sprint-a"));
    const calls = [];
    await assert.rejects(
      applyStagedMigrations(directory, { query: async sql => calls.push(sql) }),
      /ENOENT/,
    );
    assert.deepEqual(calls, ["ROLLBACK"]);
  }));
