import { join } from "node:path";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { APP_DIRECTORIES } from "../constants/environment.constant.ts";

const REVIEWED_MIGRATION_SHA256 = {
  ROLE_SETUP: "5a8151cacf0b1929441b164592aa5a205bf4a6a3ebe58d77b2d94a6e738cf125",
  CLEANUP: "1625136eef66b5703c6e0174c43001fb60a41c353db96ee1a4ccfb45542619e7",
} as const;

export const PAYMENT_TERMS_CLEANUP_PATH = join(
  APP_DIRECTORIES.BACKEND,
  "migrations/sprint-almon/after_deploy.sql",
);

export const ROLE_SETUP_PATH = join(
  APP_DIRECTORIES.BACKEND,
  "migrations/sprint-almon/before_deploy.sql",
);

const assertReviewedMigration = (migration: string, expected: string): void => {
  const fingerprint = createHash("sha256").update(migration).digest("hex");

  if (fingerprint !== expected) {
    throw new Error("Sprint almon migration changed: review it before disposable DB use");
  }
};

export const enableReviewedPaymentTermsCleanup = (migration: string): string => {
  assertReviewedMigration(migration, REVIEWED_MIGRATION_SHA256.CLEANUP);

  return migration.replace(
    /^-- (ALTER TABLE projects| {2}DROP .+|DROP TYPE IF EXISTS payment_terms;|COMMIT;)$/gm,
    "$1",
  );
};

export const enableReviewedRoleSetup = (migration: string): string => {
  assertReviewedMigration(migration, REVIEWED_MIGRATION_SHA256.ROLE_SETUP);

  return migration.replace(/^-- COMMIT;$/m, "COMMIT;");
};

export const readReviewedRoleSetup = async (): Promise<string> =>
  enableReviewedRoleSetup(await readFile(ROLE_SETUP_PATH, "utf8"));

export const readReviewedPaymentTermsCleanup = async (): Promise<string> => {
  const migration = await readFile(PAYMENT_TERMS_CLEANUP_PATH, "utf8");

  return enableReviewedPaymentTermsCleanup(migration);
};
