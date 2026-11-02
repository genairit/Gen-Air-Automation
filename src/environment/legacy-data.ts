import { TASK_TYPES } from "../constants/domain.constant.ts";
import { createTestDatabaseClient } from "./test-database-client.ts";

const ASSIGN_TASK_SQL = "UPDATE tasks SET assignee_id = $2 WHERE id = $1";

const LINK_TASK_CUSTOMER_SQL = "UPDATE tasks SET customer_id = $2 WHERE id = $1";

const runStatement = async (sql: string, parameters: string[]): Promise<void> => {
  const database = createTestDatabaseClient();

  await database.connect();

  try {
    await database.query(sql, parameters);
  } finally {
    await database.end();
  }
};

// Recreates an assignment made before assignees had to be engineers; the API now refuses to create one.
export const assignTaskBypassingApi = (taskId: string, assigneeId: string): Promise<void> =>
  runStatement(ASSIGN_TASK_SQL, [taskId, assigneeId]);

// Recreates a task saved before tasks linked to only one of a project or a customer.
export const linkTaskCustomerBypassingApi = (taskId: string, customerId: string): Promise<void> =>
  runStatement(LINK_TASK_CUSTOMER_SQL, [taskId, customerId]);

// Historical customer-only rows are inserted directly; no public API or implicit project is used.
export const insertLegacyCustomerTask = async (input: {
  title: string;
  customerId: string;
  createdById: string;
  assigneeId: string | null;
}): Promise<string> => {
  const database = createTestDatabaseClient();
  await database.connect();
  try {
    const result = await database.query<{ id: string }>(
      "INSERT INTO tasks (title, customer_id, created_by_id, assignee_id, task_type) VALUES ($1, $2, $3, $4, $5) RETURNING id",
      [input.title, input.customerId, input.createdById, input.assigneeId, TASK_TYPES.GENERAL],
    );
    return result.rows[0].id;
  } finally {
    await database.end();
  }
};
