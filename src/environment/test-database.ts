import {
  PORTS,
  TEST_DATABASE,
  APP_DIRECTORIES,
  AUTOMATION_DIRECTORIES,
} from "../constants/environment.constant.ts";

import type pg from "pg";
import { join } from "node:path";
import EmbeddedPostgres from "embedded-postgres";
import { readdir, readFile, rm } from "node:fs/promises";
import { hashPassword } from "../utilities/password.utility.ts";
import { TEST_USERS } from "../constants/test-users.constant.ts";

const MIGRATIONS_DIRECTORY = join(APP_DIRECTORIES.BACKEND, "migrations");

const SQL_EXTENSION = ".sql";

const INSERT_USER_SQL = `
  INSERT INTO users (first_name, last_name, email, phone, role, password_hash)
  VALUES ($1, $2, $3, $4, $5, $6)
`;

const createServer = () =>
  new EmbeddedPostgres({
    persistent: false,
    port: PORTS.DATABASE,
    user: TEST_DATABASE.USER,
    password: TEST_DATABASE.PASSWORD,
    databaseDir: AUTOMATION_DIRECTORIES.DATABASE,
    onLog: () => {},
  });

const listMigrationFiles = async () => {
  const fileNames = await readdir(MIGRATIONS_DIRECTORY);

  return fileNames.filter(fileName => fileName.endsWith(SQL_EXTENSION)).sort();
};

const applyMigrations = async (client: pg.Client) => {
  for (const fileName of await listMigrationFiles()) {
    const migration = await readFile(join(MIGRATIONS_DIRECTORY, fileName), "utf8");

    await client.query(migration);
  }
};

const seedTestUsers = async (client: pg.Client) => {
  for (const user of Object.values(TEST_USERS)) {
    const passwordHash = await hashPassword(user.password);

    await client.query(INSERT_USER_SQL, [
      user.firstName,
      user.lastName,
      user.email,
      user.phone,
      user.role,
      passwordHash,
    ]);
  }
};

const prepareSchema = async (server: EmbeddedPostgres) => {
  const client = server.getPgClient(TEST_DATABASE.NAME);

  await client.connect();

  try {
    await applyMigrations(client);
    await seedTestUsers(client);
  } finally {
    await client.end();
  }
};

export const startTestDatabase = async (): Promise<EmbeddedPostgres> => {
  const server = createServer();

  await rm(AUTOMATION_DIRECTORIES.DATABASE, { recursive: true, force: true });
  await server.initialise();
  await server.start();
  await server.createDatabase(TEST_DATABASE.NAME);
  await prepareSchema(server);

  return server;
};
