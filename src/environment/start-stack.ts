import type { Server } from "node:http";
import type EmbeddedPostgres from "embedded-postgres";
import type { ChildProcess } from "node:child_process";
import { startTestDatabase } from "./test-database.ts";
import { PORTS } from "../constants/environment.constant.ts";
import { createLogger } from "../utilities/logger.utility.ts";
import { startFakePlacesServer } from "./fake-places-server.ts";
import { buildBackend, startBackend } from "./backend-process.ts";

interface IStack {
  fakePlaces: Server;
  backend: ChildProcess;
  database: EmbeddedPostgres;
}

const SHUTDOWN_SIGNALS = ["SIGINT", "SIGTERM"] as const;

const EXIT_CODES = { SUCCESS: 0, FAILURE: 1 } as const;

const logger = createLogger("Stack");

const stopStack = async (stack: IStack, exitCode: number) => {
  try {
    stack.backend.kill();
    stack.fakePlaces.close();
    await stack.database.stop();
    process.exitCode = exitCode;
  } catch (error) {
    logger.error("Failed to stop the stack", { error });
    process.exitCode = EXIT_CODES.FAILURE;
  } finally {
    process.exit();
  }
};

const registerShutdown = (stack: IStack) => {
  stack.backend.on("exit", code => stopStack(stack, code ?? EXIT_CODES.FAILURE));
  SHUTDOWN_SIGNALS.forEach(signal =>
    process.on(signal, () => stopStack(stack, EXIT_CODES.SUCCESS)),
  );
};

const startStack = async () => {
  buildBackend();

  const database = await startTestDatabase();
  const fakePlaces = await startFakePlacesServer(PORTS.FAKE_PLACES);
  const backend = await startBackend();

  registerShutdown({ backend, database, fakePlaces });
  logger.info("Database, fake Places and backend are running");
};

try {
  await startStack();
} catch (error) {
  logger.error("Failed to start the stack", { error });
  process.exit(EXIT_CODES.FAILURE);
}
