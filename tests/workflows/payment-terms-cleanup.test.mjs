import {
  ROLE_SETUP_PATH,
  enableReviewedRoleSetup,
  PAYMENT_TERMS_CLEANUP_PATH,
  enableReviewedPaymentTermsCleanup,
} from "../../src/environment/payment-terms-cleanup.ts";

import { test } from "node:test";
import { parse } from "pgsql-parser";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { PAYMENT_CLEANUP_FIXTURE_SQL } from "../../src/constants/payment-cleanup-fixture.constant.ts";

const migration = await readFile(PAYMENT_TERMS_CLEANUP_PATH, "utf8");
const roleSetup = await readFile(ROLE_SETUP_PATH, "utf8");

const FORBIDDEN_STATEMENTS = new Set([
  "DoStmt",
  "CallStmt",
  "CopyStmt",
  "MergeStmt",
  "InsertStmt",
  "UpdateStmt",
  "DeleteStmt",
  "TruncateStmt",
]);

const assertReviewedStatementSafety = node => {
  if (node == null || typeof node !== "object") {
    return;
  }

  for (const [key, value] of Object.entries(node)) {
    assert.equal(FORBIDDEN_STATEMENTS.has(key), false, `Forbidden SQL statement: ${key}`);
    assert.notEqual(value, "DROP_CASCADE");
    assertReviewedStatementSafety(value);
  }
};

test("disposable cleanup enables reviewed drops and commits, never cascades or backfills", async () => {
  const executable = enableReviewedPaymentTermsCleanup(migration);

  assert.match(executable, /ALTER TABLE projects/);
  assert.match(executable, /DROP COLUMN IF EXISTS payment_terms_note/);
  assert.match(executable, /DROP COLUMN IF EXISTS payment_terms;/);
  assert.match(executable, /DROP TYPE IF EXISTS payment_terms;/);
  assert.match(executable, /\nCOMMIT;/);
  // PostgreSQL parses trigger event flags separately from executable DML, including writable CTEs.
  assertReviewedStatementSafety(await parse(executable));
});

test("operator cleanup keeps destructive statements and commit disabled", async () => {
  const tree = await parse(migration);
  assertReviewedStatementSafety(tree);
  const statements = tree.stmts.map(entry => entry.stmt);
  assert.equal(
    statements.some(statement => "AlterTableStmt" in statement),
    false,
  );
  assert.equal(
    statements.some(statement => "DropStmt" in statement),
    false,
  );
  const transactions = statements.filter(statement => "TransactionStmt" in statement);
  assert.deepEqual(
    transactions.map(statement => statement.TransactionStmt.kind),
    ["TRANS_STMT_BEGIN"],
  );
});

for (const sql of [
  "INSERT INTO customers VALUES (1, 'prepaid');",
  "UPDATE customers SET payment_terms = 'prepaid';",
  "DELETE FROM quotations;",
  "TRUNCATE customers;",
  "WITH moved AS (DELETE FROM customers RETURNING *) SELECT * FROM moved;",
  "DROP TABLE users CASCADE;",
  "COPY customers FROM STDIN;",
  "DO $$ BEGIN UPDATE customers SET payment_terms = 'prepaid'; END $$;",
]) {
  test(`statement safety rejects ${sql}`, async () => {
    const tree = await parse(sql);
    assert.throws(
      () => assertReviewedStatementSafety(tree),
      /Forbidden SQL statement|DROP_CASCADE/,
    );
  });
}

test("statement safety permits trigger event keywords without executing DML", async () => {
  assertReviewedStatementSafety(
    await parse(`
      CREATE CONSTRAINT TRIGGER fixture AFTER INSERT OR UPDATE OR DELETE ON user_roles
      DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION enforce_user_role_assignment();
    `),
  );
});

test("changed or unreviewed cleanup SQL fails closed", () => {
  assert.throws(
    () => enableReviewedPaymentTermsCleanup(`${migration}\nDROP TABLE customers;`),
    /migration changed/,
  );
  assert.throws(
    () =>
      enableReviewedPaymentTermsCleanup(
        migration.replace(
          "RETURN NULL;",
          "UPDATE customers SET payment_terms = 'prepaid'; RETURN NULL;",
        ),
      ),
    /migration changed/,
  );
});

test("changed or unreviewed role prerequisite fails closed", () => {
  assert.throws(
    () => enableReviewedRoleSetup(`${roleSetup}\nDROP TABLE users;`),
    /migration changed/,
  );
});

test("startup applies pinned role setup before optional cleanup and user seeds", async () => {
  const source = await readFile(
    new URL("../../src/environment/test-database.ts", import.meta.url),
    "utf8",
  );
  assert.match(
    source,
    /await applyMigrations\(client\);\s+await client.query\(await readReviewedRoleSetup\(\)\);\s+if \(IS_SPRINT_ALMON_CLEANUP_ENABLED\) \{\s+await client.query\(await readReviewedPaymentTermsCleanup\(\)\);\s+\}\s+await seedTestUsers\(client\);/,
  );
});

for (const phase of ["setup-only", "setup-and-cleanup"]) {
  test(`pinned ${phase} migrates legacy roles and accepts subsequent user seeds`, async () => {
    const database = new PGlite();
    try {
      await database.exec(PAYMENT_CLEANUP_FIXTURE_SQL.LEGACY_ROLES);
      await database.exec(PAYMENT_CLEANUP_FIXTURE_SQL.SNAPSHOTS);
      await database.exec(enableReviewedRoleSetup(roleSetup));
      if (phase === "setup-and-cleanup") {
        await database.exec(enableReviewedPaymentTermsCleanup(migration));
      }
      await database.exec("INSERT INTO users (role) VALUES ('finance');");
      assert.deepEqual(
        (await database.query("SELECT role FROM user_roles ORDER BY role::text")).rows,
        [{ role: "engineer" }, { role: "finance" }],
      );
      assert.deepEqual(
        (
          await database.query(`
            SELECT COUNT(*)::int AS missing FROM users
            WHERE NOT EXISTS (SELECT 1 FROM user_roles WHERE user_id = users.id AND role = users.role)
          `)
        ).rows,
        [{ missing: 0 }],
      );
      assert.deepEqual(
        (await database.query("SELECT changed_by_role FROM task_status_transitions")).rows,
        [{ changed_by_role: null }],
      );
      assert.deepEqual((await database.query("SELECT * FROM customers ORDER BY id")).rows, [
        { id: 1, payment_terms: "prepaid" },
        { id: 2, payment_terms: null },
      ]);
      assert.deepEqual((await database.query("SELECT * FROM quotations ORDER BY id")).rows, [
        { id: 1, payment_terms: "other", payment_terms_note: "Retain quote note" },
        { id: 2, payment_terms: null, payment_terms_note: "" },
      ]);
      const projectFields = (
        await database.query(`
          SELECT column_name FROM information_schema.columns
          WHERE table_name = 'projects' ORDER BY column_name
        `)
      ).rows.map(row => row.column_name);
      assert.deepEqual(
        projectFields,
        phase === "setup-only" ? ["id", "payment_terms", "payment_terms_note"] : ["id"],
      );
    } finally {
      await database.close();
    }
  });
}

test("combined cleanup preserves snapshots and role data, and enforces both deferred triggers", async () => {
  const database = new PGlite();
  try {
    await database.exec(PAYMENT_CLEANUP_FIXTURE_SQL.ROLES);
    await database.exec(PAYMENT_CLEANUP_FIXTURE_SQL.SNAPSHOTS);
    await database.exec(enableReviewedPaymentTermsCleanup(migration));
    assert.deepEqual((await database.query("SELECT * FROM projects ORDER BY id")).rows, [
      { id: 1 },
      { id: 2 },
    ]);
    assert.deepEqual((await database.query("SELECT * FROM customers ORDER BY id")).rows, [
      { id: 1, payment_terms: "prepaid" },
      { id: 2, payment_terms: null },
    ]);
    assert.deepEqual((await database.query("SELECT * FROM quotations ORDER BY id")).rows, [
      { id: 1, payment_terms: "other", payment_terms_note: "Retain quote note" },
      { id: 2, payment_terms: null, payment_terms_note: "" },
    ]);
    assert.deepEqual(
      (await database.query("SELECT typname FROM pg_type WHERE typname = 'payment_terms'")).rows,
      [],
    );
    assert.deepEqual((await database.query("SELECT role, deleted_at FROM users")).rows, [
      { role: "engineer", deleted_at: null },
    ]);
    assert.deepEqual((await database.query("SELECT role FROM user_roles")).rows, [
      { role: "engineer" },
    ]);
    assert.deepEqual((await database.query("SELECT * FROM user_role_audits")).rows, [
      { action: "fixture" },
    ]);
    assert.deepEqual((await database.query("SELECT * FROM task_status_transitions")).rows, [
      { changed_by_role: "engineer" },
    ]);
    for (const sql of ["DELETE FROM user_roles;", "UPDATE users SET role = 'finance';"]) {
      await database.exec(`BEGIN; ${sql}`);
      await assert.rejects(database.exec("COMMIT;"), /active role assigned/);
    }
    assert.deepEqual((await database.query("SELECT role FROM user_roles")).rows, [
      { role: "engineer" },
    ]);
    assert.deepEqual((await database.query("SELECT role FROM users")).rows, [{ role: "engineer" }]);
  } finally {
    await database.close();
  }
});
