import { TASK_TYPES } from "../constants/domain.constant.ts";
import { createTestDatabaseClient } from "./test-database-client.ts";

export const taskQuotationQuery = async <T extends import("pg").QueryResultRow>(
  sql: string,
  values: unknown[] = [],
): Promise<T[]> => {
  const database = createTestDatabaseClient();
  await database.connect();
  try {
    return (await database.query<T>(sql, values)).rows;
  } finally {
    await database.end();
  }
};

// A database failure after draft insertion proves the real transaction rolls back both records.
export const withTaskQuotationLinkFailure = async (
  taskId: string,
  run: () => Promise<void>,
): Promise<void> => {
  if (!/^[0-9a-f-]{36}$/i.test(taskId)) {
    throw new Error("Invalid fixture task UUID");
  }

  const errors: unknown[] = [];
  try {
    await taskQuotationQuery(
      `CREATE FUNCTION qa_reject_task_quotation_link() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.task_id::text = '${taskId}' THEN RAISE EXCEPTION 'QA link persistence failure'; END IF; RETURN NEW; END $$`,
    );
    await taskQuotationQuery(
      "CREATE TRIGGER qa_reject_task_quotation_link BEFORE INSERT ON task_quotation_links FOR EACH ROW EXECUTE FUNCTION qa_reject_task_quotation_link()",
    );
    await run();
  } catch (error) {
    errors.push(error);
  }
  for (const statement of [
    "DROP TRIGGER IF EXISTS qa_reject_task_quotation_link ON task_quotation_links",
    "DROP FUNCTION IF EXISTS qa_reject_task_quotation_link()",
  ]) {
    try {
      await taskQuotationQuery(statement);
    } catch (error) {
      errors.push(error);
    }
  }
  if (errors.length) {
    throw new AggregateError(errors, "Task quotation rollback fixture failed");
  }
};

// Reconstruct pre-constraint rows in the disposable database, restoring enforcement for all new writes.
export const setLegacyTaskQuotationFixture = async (
  taskId: string,
  customerId: string,
  deleted = false,
): Promise<void> => {
  const database = createTestDatabaseClient();
  await database.connect();
  try {
    await database.query("BEGIN");
    const constraint = await database.query<{ definition: string }>(
      "SELECT pg_get_constraintdef(oid) definition FROM pg_constraint WHERE conrelid='tasks'::regclass AND conname='chk_tasks_protected_project'",
    );
    if (!constraint.rows[0]) {
      throw new Error("Missing protected task constraint");
    }

    await database.query("ALTER TABLE tasks DROP CONSTRAINT chk_tasks_protected_project");
    await database.query(
      "UPDATE tasks SET task_type=$3, customer_id=$2, deleted_at=CASE WHEN $4 THEN NOW() ELSE NULL END WHERE id=$1",
      [taskId, customerId, TASK_TYPES.QUOTATION, deleted],
    );
    await database.query("SET CONSTRAINTS ALL IMMEDIATE");
    const definition = constraint.rows[0].definition.replace(/ NOT VALID$/, "");
    await database.query(
      `ALTER TABLE tasks ADD CONSTRAINT chk_tasks_protected_project ${definition} NOT VALID`,
    );
    await database.query("COMMIT");
  } catch (error) {
    await database.query("ROLLBACK");
    throw error;
  } finally {
    await database.end();
  }
};
