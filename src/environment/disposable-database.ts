import type pg from "pg";
import { randomUUID } from "node:crypto";
import { createTestDatabaseClient } from "./test-database-client.ts";

export const withDisposableDatabase = async (
  run: (database: pg.Client, databaseName: string) => Promise<void>,
): Promise<void> => {
  const databaseName = `qa_${randomUUID().replaceAll("-", "")}`;
  const administrator = createTestDatabaseClient();
  const database = createTestDatabaseClient(databaseName);

  await administrator.connect();
  try {
    await administrator.query(`CREATE DATABASE ${databaseName}`);
    try {
      await database.connect();
      await run(database, databaseName);
    } finally {
      try {
        await database.end();
      } finally {
        await administrator.query(`DROP DATABASE ${databaseName} WITH (FORCE)`);
      }
    }
  } finally {
    await administrator.end();
  }
};
