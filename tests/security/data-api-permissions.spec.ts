import { test, expect } from "@playwright/test";
import { createTestDatabaseClient } from "../../src/environment/test-database-client.ts";

interface IPublicTableSecurity {
  total: string;
  rls_disabled: string;
  anon_readable: string;
  authenticated_readable: string;
}

test("disposable application tables deny direct Data API role reads after all migrations", async () => {
  const database = createTestDatabaseClient();
  await database.connect();

  try {
    const result = await database.query<IPublicTableSecurity>(`
      WITH application_tables AS (
        SELECT relation.oid, relation.relrowsecurity
        FROM pg_class AS relation
        JOIN pg_namespace AS namespace ON namespace.oid = relation.relnamespace
        WHERE namespace.nspname = 'public'
          AND relation.relkind IN ('r', 'p')
          AND NOT EXISTS (
            SELECT 1
            FROM pg_depend AS dependency
            WHERE dependency.classid = 'pg_class'::regclass
              AND dependency.objid = relation.oid
              AND dependency.deptype = 'e'
          )
      )
      SELECT
        count(*) AS total,
        count(*) FILTER (WHERE NOT relrowsecurity) AS rls_disabled,
        count(*) FILTER (WHERE has_table_privilege('anon', oid, 'SELECT')) AS anon_readable,
        count(*) FILTER (WHERE has_table_privilege('authenticated', oid, 'SELECT'))
          AS authenticated_readable
      FROM application_tables
    `);

    expect(Number(result.rows[0]?.total)).toBeGreaterThan(0);
    expect(result.rows[0]).toMatchObject({
      rls_disabled: "0",
      anon_readable: "0",
      authenticated_readable: "0",
    });
    expect((await database.query("SELECT count(*) FROM users")).rows).toHaveLength(1);
  } finally {
    await database.end();
  }
});
