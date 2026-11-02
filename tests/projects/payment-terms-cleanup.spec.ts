import { API_PATHS } from "../../src/constants/api.constant.ts";
import { test, expect } from "../../src/fixtures/api.fixture.ts";
import { HTTP_METHODS, HTTP_STATUS } from "../../src/constants/http.constant.ts";
import { withDisposableDatabase } from "../../src/environment/disposable-database.ts";
import { seedCustomer, buildStandaloneProjectInput } from "../../src/api/seed-data.ts";
import { createTestDatabaseClient } from "../../src/environment/test-database-client.ts";
import { IS_SPRINT_ALMON_CLEANUP_ENABLED } from "../../src/constants/environment.constant.ts";
import { readReviewedPaymentTermsCleanup } from "../../src/environment/payment-terms-cleanup.ts";
import { RETIRED_PROJECT_PAYMENT_FIELDS } from "../../src/constants/payment-default.constant.ts";

test("disposable application schema matches the explicitly selected cleanup phase", async () => {
  const database = createTestDatabaseClient();
  await database.connect();
  try {
    const columns = await database.query(`
      SELECT table_name, column_name FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name IN ('projects', 'customers', 'quotations')
        AND column_name IN ('payment_terms', 'payment_terms_note')
      ORDER BY table_name, column_name
    `);
    expect(columns.rows).toEqual([
      { table_name: "customers", column_name: "payment_terms" },
      ...(IS_SPRINT_ALMON_CLEANUP_ENABLED
        ? []
        : [
            { table_name: "projects", column_name: "payment_terms" },
            { table_name: "projects", column_name: "payment_terms_note" },
          ]),
      { table_name: "quotations", column_name: "payment_terms" },
      { table_name: "quotations", column_name: "payment_terms_note" },
    ]);
    expect(
      (await database.query("SELECT typname FROM pg_type WHERE typname = 'payment_terms'")).rows,
    ).toEqual(IS_SPRINT_ALMON_CLEANUP_ENABLED ? [] : [{ typname: "payment_terms" }]);
  } finally {
    await database.end();
  }
});

test("reviewed cleanup discards populated project values without changing existing defaults or quote snapshots", async () => {
  await withDisposableDatabase(async (database, databaseName) => {
    await database.query(`
      CREATE TYPE payment_terms AS ENUM ('prepaid', 'other');
      CREATE TABLE projects (id integer PRIMARY KEY, payment_terms payment_terms, payment_terms_note text);
      CREATE TABLE customers (id integer PRIMARY KEY, payment_terms varchar(40));
      CREATE TABLE quotations (id integer PRIMARY KEY, payment_terms varchar(40), payment_terms_note text NOT NULL DEFAULT '');
      INSERT INTO projects VALUES (1, 'other', 'Discard this legacy project note'), (2, null, null);
      INSERT INTO customers VALUES (1, 'prepaid'), (2, null);
      INSERT INTO quotations VALUES (1, 'other', 'Retain quote note'), (2, null, '');
    `);
    await database.query(await readReviewedPaymentTermsCleanup());
    const committed = createTestDatabaseClient(databaseName);
    try {
      await committed.connect();
      expect((await committed.query("SELECT * FROM projects ORDER BY id")).rows).toEqual([
        { id: 1 },
        { id: 2 },
      ]);
      expect((await committed.query("SELECT * FROM customers ORDER BY id")).rows).toEqual([
        { id: 1, payment_terms: "prepaid" },
        { id: 2, payment_terms: null },
      ]);
      expect((await committed.query("SELECT * FROM quotations ORDER BY id")).rows).toEqual([
        { id: 1, payment_terms: "other", payment_terms_note: "Retain quote note" },
        { id: 2, payment_terms: null, payment_terms_note: "" },
      ]);
    } finally {
      await committed.end();
    }
  });
});

test("disposable migration databases are dropped after successful and rejected callbacks", async () => {
  const names: string[] = [];
  await withDisposableDatabase(async (database, name) => {
    names.push(name);
    expect((await database.query("SELECT 1 AS connected")).rows).toEqual([{ connected: 1 }]);
  });
  const failureMessage = "Intentional disposable callback failure";
  await expect(
    withDisposableDatabase(async (database, name) => {
      names.push(name);
      await database.query("CREATE TABLE cleanup_probe (id integer)");
      throw new Error(failureMessage);
    }),
  ).rejects.toThrow(failureMessage);
  const administrator = createTestDatabaseClient();
  await administrator.connect();
  try {
    expect(
      (
        await administrator.query("SELECT datname FROM pg_database WHERE datname = ANY($1)", [
          names,
        ])
      ).rows,
    ).toEqual([]);
  } finally {
    await administrator.end();
  }
});

test("project creation rejects retired payment inputs rather than validating or storing them", async ({
  api,
}) => {
  const input = await buildStandaloneProjectInput(api, await seedCustomer(api));
  for (const field of RETIRED_PROJECT_PAYMENT_FIELDS) {
    expect(
      (
        await api.send(HTTP_METHODS.POST, API_PATHS.PROJECT, { ...input, [field]: "retired" })
      ).status(),
    ).toBe(HTTP_STATUS.BAD_REQUEST);
  }
});
