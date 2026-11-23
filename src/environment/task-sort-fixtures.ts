import { createTestDatabaseClient } from "./test-database-client.ts";
import type { ITaskSortRow } from "../interfaces/task-sort.interface.ts";

export const setTaskSortFixtures = async (rows: ITaskSortRow[]): Promise<void> => {
  const database = createTestDatabaseClient();
  await database.connect();
  try {
    await database.query(
      "UPDATE tasks AS target SET due_date = fixture.due_date, is_urgent = fixture.is_urgent, status = fixture.status FROM jsonb_populate_recordset(NULL::tasks, $1::jsonb) AS fixture WHERE target.id = fixture.id",
      [
        JSON.stringify(
          rows.map(row => ({
            id: row.id,
            status: row.status,
            due_date: row.dueDate,
            is_urgent: row.isUrgent,
          })),
        ),
      ],
    );
  } finally {
    await database.end();
  }
};
