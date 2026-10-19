import {
  USER_ROLES,
  RETIRED_ROLES,
  USER_ROLE_VALUES,
} from "../../src/constants/user-role.constant.ts";

import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { test, expect } from "../../src/fixtures/test.fixture.ts";
import { APP_DIRECTORIES } from "../../src/constants/environment.constant.ts";
import { ROLE_MIGRATION } from "../../src/constants/role-migration.constant.ts";
import { createTestDatabaseClient } from "../../src/environment/test-database-client.ts";

type TDatabaseClient = ReturnType<typeof createTestDatabaseClient>;

const MIGRATIONS_DIRECTORY = join(APP_DIRECTORIES.BACKEND, "migrations");

const LEGACY_USERS = [
  { email: "legacy-admin@example.test", role: USER_ROLES.SYSTEM_ADMIN },
  { email: "legacy-installer@example.test", role: RETIRED_ROLES.LEAD_INSTALLER },
  { email: "legacy-manager@example.test", role: USER_ROLES.PROJECT_MANAGER },
] as const;

const readMigration = (fileName: string): Promise<string> =>
  readFile(join(MIGRATIONS_DIRECTORY, fileName), "utf8");

const applyMigrationsBeforeRoleAlignment = async (database: TDatabaseClient) => {
  const fileNames = await readdir(MIGRATIONS_DIRECTORY);
  const previousMigrations = fileNames
    .filter(fileName => fileName.endsWith(".sql") && fileName < ROLE_MIGRATION.FILE)
    .sort();

  for (const fileName of previousMigrations) {
    await database.query(await readMigration(fileName));
  }
};

const seedLegacyProjectTeam = async (database: TDatabaseClient) => {
  for (const user of LEGACY_USERS) {
    await database.query(
      `INSERT INTO users (first_name, last_name, email, phone, role, password_hash)
       VALUES ('QA', 'Roles', $1, '0501234567', $2, 'not-a-login')`,
      [user.email, user.role],
    );
  }

  await database.query(
    `INSERT INTO projects (code, name, project_type_id, created_by_id)
     SELECT $1, 'Legacy team', project_types.id, users.id
     FROM project_types CROSS JOIN users LIMIT 1`,
    [ROLE_MIGRATION.PROJECT_CODE],
  );
  await database.query(
    `INSERT INTO project_members (project_id, user_id, role)
     SELECT projects.id, users.id, users.role FROM projects CROSS JOIN users`,
  );
};

const readEnumRoles = async (database: TDatabaseClient): Promise<string[]> => {
  const result = await database.query("SELECT unnest(enum_range(NULL::user_role))::text AS role");

  return result.rows.map(row => String(row.role)).sort();
};

const readRoleByEmail = async (database: TDatabaseClient) => {
  const result = await database.query("SELECT email, role::text AS role FROM users ORDER BY email");

  return result.rows;
};

const readMemberRoles = async (database: TDatabaseClient): Promise<string[]> => {
  const result = await database.query("SELECT role::text AS role FROM project_members");

  return result.rows.map(row => String(row.role)).sort();
};

test("the role migration adds engineer and finance, renames lead_installer and drops admin slots", async () => {
  const databaseName = `${ROLE_MIGRATION.DATABASE_PREFIX}${randomUUID().replaceAll("-", "")}`;
  const administrator = createTestDatabaseClient();
  const database = createTestDatabaseClient(databaseName);

  await administrator.connect();
  await administrator.query(`CREATE DATABASE ${databaseName}`);
  await database.connect();

  try {
    await applyMigrationsBeforeRoleAlignment(database);
    await seedLegacyProjectTeam(database);
    await database.query(await readMigration(ROLE_MIGRATION.FILE));

    expect(await readEnumRoles(database)).toEqual([...USER_ROLE_VALUES].sort());
    expect(await readRoleByEmail(database)).toEqual([
      { email: LEGACY_USERS[0].email, role: USER_ROLES.SYSTEM_ADMIN },
      { email: LEGACY_USERS[1].email, role: USER_ROLES.INSTALLER },
      { email: LEGACY_USERS[2].email, role: USER_ROLES.PROJECT_MANAGER },
    ]);
    expect(await readMemberRoles(database)).toEqual(
      [USER_ROLES.INSTALLER, USER_ROLES.PROJECT_MANAGER].sort(),
    );
  } finally {
    await database.end();
    await administrator.query(`DROP DATABASE ${databaseName} WITH (FORCE)`);
    await administrator.end();
  }
});
