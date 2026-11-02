import { createTestDatabaseClient } from "./test-database-client.ts";

export const archiveCustomerContacts = async (customerId: string): Promise<void> => {
  const database = createTestDatabaseClient();
  await database.connect();
  try {
    await database.query("UPDATE customer_contacts SET deleted_at = now() WHERE customer_id = $1", [
      customerId,
    ]);
  } finally {
    await database.end();
  }
};

export const setIncompleteProjectContact = async (projectId: string): Promise<void> => {
  const database = createTestDatabaseClient();
  await database.connect();
  try {
    await database.query(
      "UPDATE projects SET contact_name = 'Legacy contact', contact_phone = NULL, contact_role = NULL WHERE id = $1",
      [projectId],
    );
  } finally {
    await database.end();
  }
};
