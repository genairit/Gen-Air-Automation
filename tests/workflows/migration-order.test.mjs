import { test } from "node:test";
import assert from "node:assert/strict";
import { compareMigrationFiles } from "../../src/utilities/migration-order.utility.ts";

test("mixed migration dates follow chronology and deterministic same-day schema/seed order", () => {
  const files = [
    "2026-10-31-quotation-catalogue-seed.sql",
    "20261025093708_add_feature_permissions.sql",
    "2026-10-31-quotation-builder-catalogue.sql",
    "2026-09-01_initial.sql",
  ];
  assert.deepEqual(files.sort(compareMigrationFiles), [
    "2026-09-01_initial.sql",
    "20261025093708_add_feature_permissions.sql",
    "2026-10-31-quotation-builder-catalogue.sql",
    "2026-10-31-quotation-catalogue-seed.sql",
  ]);
});
test("undated migration refuses silent replay", () =>
  assert.throws(() => compareMigrationFiles("unknown.sql", "20261025_known.sql")));
