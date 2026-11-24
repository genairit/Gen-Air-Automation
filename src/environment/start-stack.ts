import { once } from "node:events";
import type { Server } from "node:http";
import { OwnedResources } from "./owned-resources.ts";
import type { ChildProcess } from "node:child_process";
import { startFakeSmtpServer } from "./fake-smtp-server.ts";
import { stopChildProcesses } from "./stop-child-process.ts";
import { createLogger } from "../utilities/logger.utility.ts";
import { startPdfWorkerServer } from "./pdf-worker-server.ts";
import { startFakePlacesServer } from "./fake-places-server.ts";
import { buildBackend, startBackend } from "./backend-process.ts";
import { startTestDatabase, stopTestDatabase } from "./test-database.ts";
import { PORTS, EMAIL_QA_ENABLED, PDF_QA_ENABLED } from "../constants/environment.constant.ts";

const resources = new OwnedResources();
const logger = createLogger("Stack");
const cancel = (): void => resources.cancel();
process.once("SIGINT", cancel);
process.once("SIGTERM", cancel);
try {
  buildBackend();
  resources.signal.throwIfAborted();
  if (EMAIL_QA_ENABLED) {
    const smtp = await startFakeSmtpServer();
    resources.own({
      name: "SMTP",
      stop: (): Promise<void> => new Promise((resolve): void => smtp.close(resolve)),
    });
  }
  resources.signal.throwIfAborted();
  const database = await startTestDatabase();
  resources.own({
    name: "PostgreSQL",
    stop: async (): Promise<void> => {
      await stopTestDatabase(database);
    },
  });
  resources.signal.throwIfAborted();
  const places = await startFakePlacesServer(PORTS.FAKE_PLACES);
  resources.own({
    name: "Places",
    stop: (): Promise<void> =>
      new Promise((resolve, reject): Server =>
        places.close((error): void => {
          if (error) {
            reject(error);
            return;
          }

          resolve();
        }),
      ),
  });
  const children: ChildProcess[] = [];
  resources.own({
    name: "application processes",
    stop: (): Promise<void> => stopChildProcesses(children),
  });
  if (PDF_QA_ENABLED) {
    const worker = await startPdfWorkerServer(resources.signal);
    children.push(worker);
  }
  resources.signal.throwIfAborted();
  const backend = await startBackend();
  children.push(backend);
  logger.info("Database, fake Places and backend are running");
  await Promise.race([
    once(backend, "exit"),
    new Promise<void>((resolve): void => {
      if (resources.signal.aborted) {
        resolve();
        return;
      }

      resources.signal.addEventListener("abort", (): void => resolve(), { once: true });
    }),
  ]);
  if (!resources.signal.aborted) {
    process.exitCode = backend.exitCode ?? 1;
  }
} catch (error) {
  logger.error("Failed to start the stack", { error });
  process.exitCode = 1;
} finally {
  try {
    await resources.stop();
  } catch (error) {
    logger.error("Failed to stop the stack", { error });
    process.exitCode = 1;
  }
  process.removeListener("SIGINT", cancel);
  process.removeListener("SIGTERM", cancel);
}
