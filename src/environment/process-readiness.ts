import type { Server } from "node:net";
import { createServer } from "node:net";
import { TIME_UNITS } from "../constants/time.constant.ts";
import { HTTP_STATUS } from "../constants/http.constant.ts";
import { createLogger } from "../utilities/logger.utility.ts";
import type { IReadinessOptions } from "../interfaces/owned-process.interface.ts";

const logger = createLogger("Readiness");
const READINESS = {
  REQUEST_MS: TIME_UNITS.SECOND_MS,
  POLL_MS: TIME_UNITS.SECOND_MS / 10,
  START_MS: 15 * TIME_UNITS.SECOND_MS,
} as const;
export const assertLoopbackPortAvailable = async (port: number): Promise<void> => {
  const server = createServer();
  await new Promise<void>((resolve, reject): void => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", resolve);
  });
  await new Promise<void>((resolve, reject): Server =>
    server.close((error): void => {
      if (error) {
        reject(error);
        return;
      }

      resolve();
    }),
  );
};
export const readinessStatus = async (
  url: string,
  init: RequestInit = {},
): Promise<number | null> => {
  try {
    const response = await fetch(url, {
      ...init,
      signal: AbortSignal.timeout(READINESS.REQUEST_MS),
    });
    await response.body?.cancel();
    return response.status;
  } catch (error) {
    const cause = error instanceof Error && "cause" in error ? error.cause : null;
    const code = cause !== null && typeof cause === "object" && "code" in cause ? cause.code : null;
    const refused = code === "ECONNREFUSED";
    const timedOut = error instanceof Error && error.name === "TimeoutError";
    const expected = refused || timedOut;
    if (!expected) {
      logger.error("Unexpected readiness request failure", {
        kind: error instanceof Error ? error.name : "unknown",
        code,
      });
      throw new Error("Unexpected readiness request failure");
    }

    logger.info(
      code === "ECONNREFUSED" ? "Endpoint not listening yet" : "Readiness request deadline reached",
    );
    return null;
  }
};
export const waitForProcessReady = async (options: IReadinessOptions): Promise<void> => {
  const deadline = Date.now() + (options.timeoutMs ?? READINESS.START_MS);
  for (const _ of Array.from({
    length: Math.ceil((options.timeoutMs ?? READINESS.START_MS) / READINESS.POLL_MS),
  })) {
    options.signal?.throwIfAborted();
    const exited = options.child.exitCode !== null || options.child.signalCode !== null;
    if (exited) {
      throw new Error(`${options.label} exited before readiness`);
    }

    const ready = options.probe
      ? await options.probe()
      : (await readinessStatus(options.url)) === HTTP_STATUS.OK;
    const exitedDuringProbe = options.child.exitCode !== null || options.child.signalCode !== null;
    if (exitedDuringProbe) {
      throw new Error(`${options.label} exited during readiness`);
    }

    if (ready) {
      return;
    }

    if (Date.now() >= deadline) {
      break;
    }
    await new Promise((resolve): NodeJS.Timeout => setTimeout(resolve, READINESS.POLL_MS));
  }
  throw new Error(`${options.label} readiness deadline reached`);
};
