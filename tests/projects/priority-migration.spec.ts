import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { test, expect } from "../../src/fixtures/test.fixture.ts";
import { APP_DIRECTORIES } from "../../src/constants/environment.constant.ts";
import { PROJECT_PRIORITY } from "../../src/constants/project-priority.constant.ts";
import { createTestDatabaseClient } from "../../src/environment/test-database-client.ts";

const MIGRATIONS_DIRECTORY = join(APP_DIRECTORIES.BACKEND, "migrations");

const readMigration = (fileName: string): Promise<string> =>
  readFile(join(MIGRATIONS_DIRECTORY, fileName), "utf8");

const readPriorityValues = async (database: ReturnType<typeof createTestDatabaseClient>) => {
  const result = await database.query(
    "SELECT code, priority_id, priority_synced_at::text FROM public.projects ORDER BY code",
  );

  return result.rows;
};

test("both migration phases preserve existing values, nulls and old-backend read compatibility", async () => {
  const databaseName = `qa_priority_${randomUUID().replaceAll("-", "")}`;
  const administrator = createTestDatabaseClient();
  const database = createTestDatabaseClient(databaseName);

  await administrator.connect();
  await administrator.query(`CREATE DATABASE ${databaseName}`);
  await database.connect();

  try {
    const migrationFiles = await readdir(MIGRATIONS_DIRECTORY);
    const previousMigrations = migrationFiles
      .filter(fileName => fileName.endsWith(".sql") && fileName < PROJECT_PRIORITY.RENAME_MIGRATION)
      .sort();

    for (const fileName of previousMigrations) {
      await database.query(await readMigration(fileName));
    }

    await database.query(`
      INSERT INTO users (first_name, last_name, email, phone, role, password_hash)
      VALUES ('QA', 'Migration', 'migration@example.test', '0501234567', 'system_admin', 'not-a-login');
    `);
    await database.query(
      `
      INSERT INTO projects (code, name, project_type_id, created_by_id, erp_reference, erp_synced_at)
      SELECT 'QA-00001', 'Preserved Priority', project_types.id, users.id, $1, $2::timestamptz
      FROM project_types CROSS JOIN users LIMIT 1;
    `,
      [PROJECT_PRIORITY.ID, PROJECT_PRIORITY.SYNCED_AT],
    );
    await database.query(`
      INSERT INTO projects (code, name, project_type_id, created_by_id)
      SELECT 'QA-00002', 'Nullable Priority', project_types.id, users.id
      FROM project_types CROSS JOIN users LIMIT 1;
    `);

    const before = await database.query(
      "SELECT code, erp_reference AS priority_id, erp_synced_at::text AS priority_synced_at FROM public.projects ORDER BY code",
    );

    await database.query(await readMigration(PROJECT_PRIORITY.RENAME_MIGRATION));
    expect(await readPriorityValues(database)).toEqual(before.rows);

    const legacyRead = await database.query(
      "SELECT code, erp_reference AS priority_id, erp_synced_at::text AS priority_synced_at FROM public.projects ORDER BY code",
    );

    expect(legacyRead.rows).toEqual(before.rows);

    await database.query(`
      INSERT INTO projects (code, name, project_type_id, created_by_id)
      SELECT 'QA-00003', 'Created during rollout', project_types.id, users.id
      FROM project_types CROSS JOIN users LIMIT 1;
      UPDATE projects SET name = 'Updated during rollout' WHERE code = 'QA-00001';
    `);
    const duringRollout = await readPriorityValues(database);

    expect(duringRollout).toEqual([
      ...before.rows,
      { code: "QA-00003", priority_id: null, priority_synced_at: null },
    ]);
    await database.query(await readMigration(PROJECT_PRIORITY.CLEANUP_MIGRATION));
    expect(await readPriorityValues(database)).toEqual(duringRollout);

    const columns = await database.query(`
      SELECT column_name, data_type, is_nullable, character_maximum_length, datetime_precision
      FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'projects'
      AND column_name IN ('priority_id', 'priority_synced_at', 'erp_reference', 'erp_synced_at')
      ORDER BY column_name
    `);

    expect(columns.rows).toEqual([
      {
        column_name: "priority_id",
        data_type: "character varying",
        is_nullable: "YES",
        character_maximum_length: 64,
        datetime_precision: null,
      },
      {
        column_name: "priority_synced_at",
        data_type: "timestamp with time zone",
        is_nullable: "YES",
        character_maximum_length: null,
        datetime_precision: 3,
      },
    ]);
  } finally {
    await database.end();
    await administrator.query(`DROP DATABASE ${databaseName} WITH (FORCE)`);
    await administrator.end();
  }
});
