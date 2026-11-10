import type { Server } from "node:http";
import type { SMTPServer } from "smtp-server";
import type EmbeddedPostgres from "embedded-postgres";
import type { ChildProcess } from "node:child_process";
import { startFakeSmtpServer } from "./fake-smtp-server.ts";
import { createLogger } from "../utilities/logger.utility.ts";
import { startPdfWorkerServer } from "./pdf-worker-server.ts";
import { startFakePlacesServer } from "./fake-places-server.ts";
import { buildBackend, startBackend } from "./backend-process.ts";
import { startTestDatabase, stopTestDatabase } from "./test-database.ts";
import { PORTS, EMAIL_QA_ENABLED, PDF_QA_ENABLED } from "../constants/environment.constant.ts";

interface IStack {
  fakePlaces: Server;
  backend: ChildProcess;
  smtp: SMTPServer | null;
  database: EmbeddedPostgres;
  pdfWorker: ChildProcess | null;
}

const SHUTDOWN_SIGNALS = ["SIGINT", "SIGTERM"] as const;

const EXIT_CODES = { SUCCESS: 0, FAILURE: 1 } as const;

const logger = createLogger("Stack");

const stopStack = async (stack: IStack, exitCode: number) => {
  try {
    stack.backend.kill();
    stack.fakePlaces.close();
    stack.pdfWorker?.kill();
    stack.smtp?.close();
    await stopTestDatabase(stack.database);
    process.exitCode = exitCode;
  } catch (error) {
    logger.error("Failed to stop the stack", { error });
    process.exitCode = EXIT_CODES.FAILURE;
  } finally {
    process.exit();
  }
};

const waitForShutdown = (backend: ChildProcess) =>
  new Promise<number>(resolve => {
    backend.once("exit", code => resolve(code ?? EXIT_CODES.FAILURE));
    SHUTDOWN_SIGNALS.forEach(signal => process.once(signal, () => resolve(EXIT_CODES.SUCCESS)));
  });

const startStack = async () => {
  buildBackend();

  const smtp = EMAIL_QA_ENABLED ? await startFakeSmtpServer() : null;
  const database = await startTestDatabase();
  const fakePlaces = await startFakePlacesServer(PORTS.FAKE_PLACES);
  const pdfWorker = PDF_QA_ENABLED ? await startPdfWorkerServer() : null;
  const backend = await startBackend();

  logger.info("Database, fake Places and backend are running");
  return { backend, database, fakePlaces, pdfWorker, smtp };
};

try {
  const stack = await startStack();
  const exitCode = await waitForShutdown(stack.backend);
  await stopStack(stack, exitCode);
} catch (error) {
  logger.error("Failed to start the stack", { error });
  process.exit(EXIT_CODES.FAILURE);
}
