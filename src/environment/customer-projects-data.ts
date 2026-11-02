import { createTestDatabaseClient } from "./test-database-client.ts";

export const updateProjectRelationFixture = async (
  projectId: string,
  changes: { customerId?: string | null; deleted?: boolean; name?: string; updatedAt?: string },
): Promise<void> => {
  const database = createTestDatabaseClient();
  await database.connect();
  try {
    if (Object.hasOwn(changes, "customerId")) {
      await database.query("UPDATE projects SET customer_id = $2 WHERE id = $1", [
        projectId,
        changes.customerId,
      ]);
    }
    if (changes.deleted) {
      await database.query("UPDATE projects SET deleted_at = now() WHERE id = $1", [projectId]);
    }
    if (changes.name) {
      await database.query("UPDATE projects SET name = $2 WHERE id = $1", [
        projectId,
        changes.name,
      ]);
    }
    if (changes.updatedAt) {
      await database.query("UPDATE projects SET updated_at = $2 WHERE id = $1", [
        projectId,
        changes.updatedAt,
      ]);
    }
  } finally {
    await database.end();
  }
};
