import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { test, expect } from "../../src/fixtures/api.fixture.ts";
import { APP_DIRECTORIES } from "../../src/constants/environment.constant.ts";
import { createTestDatabaseClient } from "../../src/environment/test-database-client.ts";

const CONTACT_MIGRATION = "2026-10-28-add-customer-contacts.sql";
const MIGRATIONS_DIRECTORY = join(APP_DIRECTORIES.BACKEND, "migrations");

test("contact migration starts empty despite existing customer and project contact data", async () => {
  const name = `qa_contacts_${randomUUID().replaceAll("-", "")}`;
  const owner = createTestDatabaseClient();
  const database = createTestDatabaseClient(name);
  await owner.connect();
  await owner.query(`CREATE DATABASE ${name}`);
  await database.connect();
  try {
    const files = (await readdir(MIGRATIONS_DIRECTORY))
      .filter(file => file.endsWith(".sql") && file < CONTACT_MIGRATION)
      .sort();
    for (const file of files) {
      await database.query(await readFile(join(MIGRATIONS_DIRECTORY, file), "utf8"));
    }
    await database.query(`INSERT INTO users(first_name,last_name,email,phone,role,password_hash)
      VALUES('QA','Migration','qa-contacts@example.test','0501234567','system_admin','not-a-login')`);
    await database.query(`INSERT INTO customers(customer_type,name,tax_id,address,contact_name,phone,email,created_by_id)
      SELECT 'company','Existing customer','123456789','Existing address','Old customer contact',
        '0501234567','old-customer@example.test',id FROM users`);
    await database.query(`INSERT INTO projects(code,name,project_type_id,created_by_id,customer_id,
      customer_name,customer_phone,customer_email,contact_name,contact_phone,contact_role)
      SELECT 'GA-00055','Existing project',project_types.id,users.id,customers.id,
        'Old apartment customer','0521234567','old-apartment@example.test','Old site contact','0531234567','Site manager'
      FROM project_types CROSS JOIN users CROSS JOIN customers LIMIT 1`);
    expect((await database.query("SELECT contact_name FROM customers")).rows).toEqual([
      { contact_name: "Old customer contact" },
    ]);
    expect((await database.query("SELECT contact_name FROM projects")).rows).toEqual([
      { contact_name: "Old site contact" },
    ]);
    await database.query(await readFile(join(MIGRATIONS_DIRECTORY, CONTACT_MIGRATION), "utf8"));
    expect((await database.query("SELECT * FROM customer_contacts")).rows).toEqual([]);
    expect(
      (
        await database.query(
          "SELECT relrowsecurity FROM pg_class WHERE oid='public.customer_contacts'::regclass",
        )
      ).rows,
    ).toEqual([{ relrowsecurity: true }]);
    for (const role of ["anon", "authenticated"]) {
      const privileges = await database.query(
        "SELECT has_table_privilege($1,'public.customer_contacts','SELECT') AS can_read, has_table_privilege($1,'public.customer_contacts','INSERT') AS can_write",
        [role],
      );
      expect(privileges.rows).toEqual([{ can_read: false, can_write: false }]);
      await database.query(`SET ROLE ${role}`);
      await expect(database.query("SELECT * FROM customer_contacts")).rejects.toThrow(
        /permission denied/,
      );
      await expect(database.query("DELETE FROM customer_contacts")).rejects.toThrow(
        /permission denied/,
      );
      await database.query("RESET ROLE");
    }
    const columns = await database.query<{ column_name: string }>(
      "SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name='customer_contacts' ORDER BY column_name",
    );
    expect(columns.rows.map(row => row.column_name)).toEqual([
      "created_at",
      "created_by_id",
      "customer_id",
      "deleted_at",
      "email",
      "id",
      "name",
      "phone",
      "role",
      "updated_at",
    ]);
  } finally {
    await database.end();
    await owner.query(`DROP DATABASE ${name} WITH (FORCE)`);
    await owner.end();
  }
});

