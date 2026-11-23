import { createTestDatabaseClient } from "./test-database-client.ts";

export const linkLegacyCustomerPrimary = async (customerIds: string[], contactId: string) => {
  const database = createTestDatabaseClient();
  await database.connect();
  try {
    await database.query(
      "UPDATE customers SET primary_contact_id = $1 WHERE id = ANY($2::uuid[])",
      [contactId, customerIds],
    );
  } finally {
    await database.end();
  }
};

export const readContactOwner = async (contactId: string): Promise<string | null> => {
  const database = createTestDatabaseClient();
  await database.connect();
  try {
    const result = await database.query<{ customer_id: string | null }>(
      "SELECT customer_id FROM customer_contacts WHERE id = $1 AND deleted_at IS NULL",
      [contactId],
    );
    if (result.rows.length !== 1) {
      throw new Error("Expected one persisted contact");
    }

    return result.rows[0].customer_id;
  } finally {
    await database.end();
  }
};

export const setLegacyContactOwner = async (contactId: string, customerId: string) => {
  const database = createTestDatabaseClient();
  await database.connect();
  try {
    await database.query("UPDATE customer_contacts SET customer_id = $1 WHERE id = $2", [
      customerId,
      contactId,
    ]);
  } finally {
    await database.end();
  }
};
