import {
  PAYMENT_TERMS_CLEANUP_PATH,
  enableReviewedPaymentTermsCleanup,
} from "../../src/environment/payment-terms-cleanup.ts";

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const migration = await readFile(PAYMENT_TERMS_CLEANUP_PATH, "utf8");

test("disposable cleanup enables reviewed drops and commits, never cascades or backfills", () => {
  const executable = enableReviewedPaymentTermsCleanup(migration)
    .split("\n")
    .filter(line => !line.trimStart().startsWith("--"))
    .join("\n");

  assert.match(executable, /ALTER TABLE projects/);
  assert.match(executable, /DROP COLUMN IF EXISTS payment_terms_note/);
  assert.match(executable, /DROP COLUMN IF EXISTS payment_terms;/);
  assert.match(executable, /DROP TYPE IF EXISTS payment_terms;/);
  assert.match(executable, /\nCOMMIT;/);
  assert.doesNotMatch(executable, /\b(CASCADE|UPDATE|INSERT|DELETE|TRUNCATE)\b/i);
});

test("changed or unreviewed cleanup SQL fails closed", () => {
  assert.throws(
    () => enableReviewedPaymentTermsCleanup(`${migration}\nDROP TABLE customers;`),
    /cleanup changed/,
  );
});
