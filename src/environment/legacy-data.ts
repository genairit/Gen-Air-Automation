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
