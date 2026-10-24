import { join } from "node:path";
import { expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { createTestDatabaseClient } from "./test-database-client.ts";
import { LEGACY_APARTMENT } from "../constants/apartment-backend.constant.ts";
import { APP_DIRECTORIES, TEST_DATABASE } from "../constants/environment.constant.ts";

interface ILegacyApartmentRow {
  id: string;
  contact_name: string;
  customer_name: string;
  contact_phone: string;
  has_own_team: boolean;
  customer_phone: string;
  customer_id: string | null;
}

interface IConstraintRow {
  conname: string;
}

interface IMigrationScenario {
  ownId: string;
  customerId: string;
  inheritedId: string;
}

export const verifyApartmentMigration = async (scenario: IMigrationScenario): Promise<void> => {
  const client = createTestDatabaseClient();
  await client.connect();
  try {
    const identity = await client.query<{ name: string }>("SELECT current_database() AS name");
    expect(identity.rows[0].name).toBe(TEST_DATABASE.NAME);
    await client.query("BEGIN");
    await client.query(
      "UPDATE projects SET customer_id = NULL WHERE parent_project_id IS NOT NULL",
    );
    await client.query(
      "UPDATE projects SET customer_name = $2, customer_phone = $3, contact_name = $4, contact_phone = $5 WHERE id = ANY($1::uuid[])",
      [
        [scenario.ownId, scenario.inheritedId],
        LEGACY_APARTMENT.CUSTOMER_NAME,
        LEGACY_APARTMENT.CUSTOMER_PHONE,
        LEGACY_APARTMENT.CONTACT_NAME,
        LEGACY_APARTMENT.CONTACT_PHONE,
      ],
    );
    await client.query("ALTER TABLE projects DROP COLUMN has_own_team");
    await client.query(
      "ALTER TABLE projects ADD CONSTRAINT chk_projects_apartment_has_no_customer CHECK (parent_project_id IS NULL OR customer_id IS NULL)",
    );
    const source = await readFile(
      join(APP_DIRECTORIES.BACKEND, "migrations/2026-10-24-add-apartment-team-inheritance.sql"),
      "utf8",
    );
    const migration = source.replace(/^BEGIN;\s*$/m, "").replace(/^COMMIT;\s*$/m, "");
    await client.query(migration);
    const rows = await client.query<ILegacyApartmentRow>(
      "SELECT id, customer_name, customer_phone, contact_name, contact_phone, customer_id, has_own_team FROM projects WHERE id = ANY($1::uuid[])",
      [[scenario.ownId, scenario.inheritedId]],
    );
    expect(rows.rows).toHaveLength(2);
    expect(rows.rows.find(row => row.id === scenario.ownId)).toMatchObject({ has_own_team: true });
    expect(rows.rows.find(row => row.id === scenario.inheritedId)).toMatchObject({
      has_own_team: false,
    });
    for (const row of rows.rows) {
      expect(row).toMatchObject({
        customer_name: LEGACY_APARTMENT.CUSTOMER_NAME,
        customer_phone: LEGACY_APARTMENT.CUSTOMER_PHONE,
        contact_phone: LEGACY_APARTMENT.CONTACT_PHONE,
        contact_name: LEGACY_APARTMENT.CONTACT_NAME,
        customer_id: null,
      });
    }
    const constraints = await client.query<IConstraintRow>(
      "SELECT conname FROM pg_constraint WHERE conrelid = 'projects'::regclass",
    );
    const names = constraints.rows.map(row => row.conname);
    expect(names).not.toContain("chk_projects_apartment_has_no_customer");
    expect(names).toContain("chk_projects_apartment_has_floor_and_number");
    expect(names).toContain("projects_customer_id_fkey");
    await client.query("UPDATE projects SET customer_id = $2 WHERE id = $1", [
      scenario.inheritedId,
      scenario.customerId,
    ]);
    const linked = await client.query<{ customer_id: string }>(
      "SELECT customer_id FROM projects WHERE id = $1",
      [scenario.inheritedId],
    );
    expect(linked.rows[0].customer_id).toBe(scenario.customerId);
    await client.query("SAVEPOINT invalid_floor");
    await expect(
      client.query("UPDATE projects SET customer_floor = NULL WHERE id = $1", [scenario.ownId]),
    ).rejects.toMatchObject({ code: "23514" });
    await client.query("ROLLBACK TO SAVEPOINT invalid_floor");
    await client.query("SAVEPOINT nested_apartment");
    await expect(
      client.query("UPDATE projects SET parent_project_id = $2 WHERE id = $1", [
        scenario.ownId,
        scenario.inheritedId,
      ]),
    ).rejects.toMatchObject({ code: "23514" });
    await client.query("ROLLBACK TO SAVEPOINT nested_apartment");
  } finally {
    await client.query("ROLLBACK");
    await client.end();
  }
};
