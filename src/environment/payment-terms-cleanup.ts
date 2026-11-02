import { join } from "node:path";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { APP_DIRECTORIES } from "../constants/environment.constant.ts";

const REVIEWED_MIGRATION_SHA256 =
  "90575765f435d9c36d1f4975a162074ab101cd2cd1758a20dd0c932876352d49";

export const PAYMENT_TERMS_CLEANUP_PATH = join(
  APP_DIRECTORIES.BACKEND,
  "migrations/sprint-almon/after_deploy.sql",
);

export const enableReviewedPaymentTermsCleanup = (migration: string): string => {
  const fingerprint = createHash("sha256").update(migration).digest("hex");

  if (fingerprint !== REVIEWED_MIGRATION_SHA256) {
    throw new Error(
      "Sprint almon cleanup changed: review it before enabling disposable DB cleanup",
    );
  }

  return migration.replace(
    /^-- (ALTER TABLE projects| {2}DROP .+|DROP TYPE IF EXISTS payment_terms;|COMMIT;)$/gm,
    "$1",
  );
};

export const readReviewedPaymentTermsCleanup = async (): Promise<string> => {
  const migration = await readFile(PAYMENT_TERMS_CLEANUP_PATH, "utf8");

  return enableReviewedPaymentTermsCleanup(migration);
};
