import {
  preparePaymentCleanupStage,
  preparePaymentPreservingStage,
} from "./payment-terms-cleanup.ts";

import {
  PORTS,
  TEST_DATABASE,
  APP_DIRECTORIES,
  AUTOMATION_DIRECTORIES,
  IS_SPRINT_ALMON_CLEANUP_ENABLED,
} from "../constants/environment.constant.ts";

import type pg from "pg";
import { join } from "node:path";
import { promisify } from "node:util";
import { execFile } from "node:child_process";
import EmbeddedPostgres from "embedded-postgres";
import { readdir, readFile, rm } from "node:fs/promises";
import { applyStagedMigrations } from "./staged-migrations.ts";
import { hashPassword } from "../utilities/password.utility.ts";
import { SETUP_TEST_USERS } from "../constants/test-users.constant.ts";
import { compareMigrationFiles } from "../utilities/migration-order.utility.ts";

const MIGRATIONS_DIRECTORY = join(APP_DIRECTORIES.BACKEND, "migrations");
const runCommand = promisify(execFile);

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
    postgresFlags: [...TEST_DATABASE.FLAGS],
    initdbFlags: [...TEST_DATABASE.INIT_FLAGS],
    onLog: () => {},
  });

const listMigrationFiles = async () => {
  const fileNames = await readdir(MIGRATIONS_DIRECTORY);

  return fileNames.filter(fileName => fileName.endsWith(SQL_EXTENSION)).sort(compareMigrationFiles);
};

const prepareDataApiRoles = async (client: pg.Client) => {
  const result = await client.query<{ rolname: string }>(
    "SELECT rolname FROM pg_roles WHERE rolname = ANY($1)",
    [TEST_DATABASE.DATA_API_ROLES],
  );
  const existing = new Set(result.rows.map(row => row.rolname));

  for (const role of TEST_DATABASE.DATA_API_ROLES) {
    if (!existing.has(role)) {
      await client.query(`CREATE ROLE ${role} NOLOGIN`);
    }
  }
};

const applyMigrations = async (client: pg.Client) => {
  for (const fileName of await listMigrationFiles()) {
    const migration = await readFile(join(MIGRATIONS_DIRECTORY, fileName), "utf8");

    await client.query(migration);
  }

  const prepareStage = IS_SPRINT_ALMON_CLEANUP_ENABLED
    ? preparePaymentCleanupStage
    : preparePaymentPreservingStage;
  await applyStagedMigrations(MIGRATIONS_DIRECTORY, client, prepareStage);
};

const seedTestUsers = async (client: pg.Client) => {
  for (const user of SETUP_TEST_USERS) {
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
    await prepareDataApiRoles(client);
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

export const stopTestDatabase = async (server: EmbeddedPostgres) => {
  if (process.platform !== "darwin") {
    await server.stop();
    return;
  }

  const [postmasterResult] = await Promise.allSettled([
    readFile(join(AUTOMATION_DIRECTORIES.DATABASE, "postmaster.pid"), "utf8"),
  ]);

  try {
    await server.stop();
  } finally {
    if (postmasterResult.status === "rejected") {
      throw new Error("Could not read disposable Postgres IPC identifiers", {
        cause: postmasterResult.reason,
      });
    }

    const lines = postmasterResult.value.split("\n");
    const postgresPid = Number(lines[0]);
    const sharedMemoryId = Number(lines[6]?.trim().split(/\s+/)[1]);

    if (!Number.isSafeInteger(postgresPid) || !Number.isSafeInteger(sharedMemoryId)) {
      throw new Error("Disposable Postgres IPC identifiers are invalid");
    }

    try {
      process.kill(postgresPid, 0);
      throw new Error("Disposable Postgres is still running after shutdown");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ESRCH") {
        throw error;
      }
    }

    const { stdout } = await runCommand("ipcs", ["-mp"]);
    const matchingSegment = stdout
      .split("\n")
      .map(line => line.trim().split(/\s+/))
      .find(parts => parts[0] === "m" && Number(parts[1]) === sharedMemoryId);

    if (matchingSegment) {
      if (Number(matchingSegment[6]) !== postgresPid) {
        throw new Error("Disposable Postgres IPC ownership does not match postmaster.pid");
      }

      await runCommand("ipcrm", ["-m", String(sharedMemoryId)]);
    }
  }
};
