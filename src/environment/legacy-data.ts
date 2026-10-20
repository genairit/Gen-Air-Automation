import { createTestDatabaseClient } from "./test-database-client.ts";

const ASSIGN_TASK_SQL = "UPDATE tasks SET assignee_id = $2 WHERE id = $1";

// Recreates an assignment made before assignees had to be engineers; the API now refuses to create one.
export const assignTaskBypassingApi = async (taskId: string, assigneeId: string): Promise<void> => {
  const database = createTestDatabaseClient();

  await database.connect();

  try {
    await database.query(ASSIGN_TASK_SQL, [taskId, assigneeId]);
  } finally {
    await database.end();
  }
};
