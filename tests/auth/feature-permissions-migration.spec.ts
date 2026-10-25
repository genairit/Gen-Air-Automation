import {
  PERMISSION_VALUES,
  PERMISSION_MIGRATION,
} from "../../src/constants/permission.constant.ts";

import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { test, expect } from "../../src/fixtures/test.fixture.ts";
import { USER_ROLE_VALUES } from "../../src/constants/user-role.constant.ts";
import { APP_DIRECTORIES } from "../../src/constants/environment.constant.ts";
import { createTestDatabaseClient } from "../../src/environment/test-database-client.ts";

const DIRECTORY = join(APP_DIRECTORIES.BACKEND, "migrations");
const readMigration = (name: string) => readFile(join(DIRECTORY, name), "utf8");

test("feature migration preserves existing data and enforces grants, keys and private access", async () => {
  const name = `qa_permissions_${randomUUID().replaceAll("-", "")}`;
  const owner = createTestDatabaseClient();
  const database = createTestDatabaseClient(name);
  await owner.connect();
  await owner.query(`CREATE DATABASE ${name}`);
  await database.connect();
  try {
    const files = (await readdir(DIRECTORY))
      .filter(file => file.endsWith(".sql") && file < PERMISSION_MIGRATION)
      .sort();
    for (const file of files) {
      await database.query(await readMigration(file));
    }
    await database.query(`INSERT INTO users(first_name,last_name,email,phone,role,password_hash)
      VALUES('QA','Preserved','qa-migration@example.test','0501234567','system_admin','not-a-login')`);
    await database.query(`INSERT INTO projects(code,name,project_type_id,created_by_id)
      SELECT 'GA-00047','Existing project',project_types.id,users.id FROM project_types CROSS JOIN users LIMIT 1`);
    const before = await database.query("SELECT row_to_json(users) AS account FROM users");
    const projects = await database.query("SELECT row_to_json(projects) AS project FROM projects");
    await database.query("CREATE ROLE qa_permission_client NOLOGIN");
    await database.query(await readMigration(PERMISSION_MIGRATION));
    expect((await database.query("SELECT row_to_json(users) AS account FROM users")).rows).toEqual(
      before.rows,
    );
    expect(
      (await database.query("SELECT row_to_json(projects) AS project FROM projects")).rows,
    ).toEqual(projects.rows);
    const keys = await database.query<{ key: string }>("SELECT key FROM permissions ORDER BY key");
    expect(keys.rows.map(row => row.key)).toEqual([...PERMISSION_VALUES].sort());
    const roles = await database.query<{ role: string }>(
      "SELECT DISTINCT role::text AS role FROM role_permissions ORDER BY role::text",
    );
    expect(roles.rows.map(row => row.role)).toEqual([...USER_ROLE_VALUES].sort());
    const security = await database.query(
      "SELECT relname, relrowsecurity FROM pg_class WHERE relname IN ('permissions','role_permissions') ORDER BY relname",
    );
    expect(security.rows).toEqual([
      { relname: "permissions", relrowsecurity: true },
      { relname: "role_permissions", relrowsecurity: true },
    ]);
    for (const statement of [
      "INSERT INTO role_permissions VALUES ('finance', 'projects.read')",
      "INSERT INTO role_permissions VALUES ('finance', 'unknown.grant')",
      "INSERT INTO permissions VALUES ('invalid.key', 'different', 'key')",
      "DELETE FROM permissions WHERE key = 'projects.read'",
    ]) {
      await expect(database.query(statement)).rejects.toThrow();
    }
    await database.query("SET ROLE qa_permission_client");
    for (const table of ["permissions", "role_permissions"]) {
      await expect(database.query(`SELECT * FROM ${table}`)).rejects.toThrow(/permission denied/);
      await expect(database.query(`DELETE FROM ${table}`)).rejects.toThrow(/permission denied/);
    }
    await database.query("RESET ROLE");
    // A trusted-role SELECT grant must still not expose grant rows through RLS.
    await database.query("GRANT SELECT ON permissions, role_permissions TO qa_permission_client");
    await database.query("SET ROLE qa_permission_client");
    expect((await database.query("SELECT * FROM permissions")).rows).toEqual([]);
    expect((await database.query("SELECT * FROM role_permissions")).rows).toEqual([]);
    await database.query("RESET ROLE");
    await database.query("DROP OWNED BY qa_permission_client");
    await database.query("DROP ROLE qa_permission_client");
  } finally {
    await database.end();
    await owner.query(`DROP DATABASE ${name} WITH (FORCE)`);
    await owner.query("DROP ROLE IF EXISTS qa_permission_client");
    await owner.end();
  }
});

test("backend, frontend and migration permission catalogs have the same stable keys", async () => {
  const files = [
    join(APP_DIRECTORIES.BACKEND, "src/constants/authorization.constant.ts"),
    join(APP_DIRECTORIES.FRONTEND, "src/constants/permission.constant.ts"),
  ];
  for (const file of files) {
    const source = await readFile(file, "utf8");
    const keys = [...source.matchAll(/\w+: ['"]([a-z_]+\.[a-z_.]+)['"]/g)]
      .map(match => match[1])
      .sort();
    expect(keys).toEqual([...PERMISSION_VALUES].sort());
  }
});
