import { createTestDatabaseClient } from "./test-database-client.ts";
import type { UserRoleType } from "../constants/user-role.constant.ts";

export const withRolePermissions = async <T>(
  role: UserRoleType,
  permissions: readonly string[],
  run: () => Promise<T>,
): Promise<T> => {
  const database = createTestDatabaseClient();
  await database.connect();
  const original = await database.query<{ permission_key: string }>(
    "SELECT permission_key FROM role_permissions WHERE role = $1",
    [role],
  );
  const replace = async (keys: readonly string[]) => {
    await database.query("BEGIN");
    try {
      await database.query("DELETE FROM role_permissions WHERE role = $1", [role]);
      await database.query(
        "INSERT INTO role_permissions(role, permission_key) SELECT $1::user_role, unnest($2::text[])",
        [role, keys],
      );
      await database.query("COMMIT");
    } catch (error) {
      await database.query("ROLLBACK");
      throw error;
    }
  };
  try {
    await replace(permissions);
    return await run();
  } finally {
    try {
      await replace(original.rows.map(row => row.permission_key));
    } finally {
      await database.end();
    }
  }
};
