import {
  readinessStatus,
  waitForProcessReady,
  assertLoopbackPortAvailable,
} from "./process-readiness.ts";

import {
  URLS,
  PORTS,
  APP_DIRECTORIES,
  PUBLICATION_BROKER,
  AUTOMATION_DIRECTORIES,
} from "../constants/environment.constant.ts";

import { join } from "node:path";
import { spawn, spawnSync } from "node:child_process";
import type { ChildProcess } from "node:child_process";
import { mkdir, mkdtemp, symlink } from "node:fs/promises";
import { stopChildProcess } from "./stop-child-process.ts";
import { WORKER_RUNTIME_TOKEN } from "./worker-runtime-token.ts";
import { HTTP_METHODS, HTTP_STATUS } from "../constants/http.constant.ts";

const ENTRY = join(APP_DIRECTORIES.WORKER, "dist/main.js");

export const startPdfWorkerServer = async (signal?: AbortSignal): Promise<ChildProcess> => {
  const broker = new URL(PUBLICATION_BROKER.URL);
  if (!["localhost", "127.0.0.1", "[::1]"].includes(broker.hostname)) {
    throw new Error("PDF QA requires a disposable loopback RabbitMQ broker");
  }

  signal?.throwIfAborted();
  await assertLoopbackPortAvailable(PORTS.PDF_WORKER);
  await mkdir(AUTOMATION_DIRECTORIES.FIXTURES, { recursive: true });
  const runtime = await mkdtemp(join(AUTOMATION_DIRECTORIES.FIXTURES, "worker-runtime-"));
  const token = WORKER_RUNTIME_TOKEN;
  await Promise.all(
    ["assets", "node_modules"].map((name): Promise<void> =>
      symlink(join(APP_DIRECTORIES.WORKER, name), join(runtime, name), "dir"),
    ),
  );
  if (process.env.GEN_AIR_WORKER_PREBUILT !== "1") {
    const build = spawnSync("npm", ["run", "build"], {
      cwd: APP_DIRECTORIES.WORKER,
      stdio: "inherit",
    });
    if (build.status !== 0) {
      throw new Error("Gen-Air-Worker build failed");
    }
  }

  const server = spawn(process.execPath, [ENTRY], {
    cwd: runtime,
    stdio: "inherit",
    env: {
      ...process.env,
      PORT: String(PORTS.PDF_WORKER),
      RABBITMQ_URL: PUBLICATION_BROKER.URL,
      WORKER_QUEUE_PREFIX: PUBLICATION_BROKER.PREFIX,
      WORKER_API_TOKEN: token,
      WORKER_PREFETCH: "1",
      NODE_OPTIONS: "",
    },
  });
  try {
    await waitForProcessReady({
      child: server,
      signal,
      label: "PDF Worker",
      url: `${URLS.PDF_WORKER}/health/ready`,
      probe: async (): Promise<boolean> => {
        if ((await readinessStatus(`${URLS.PDF_WORKER}/health/ready`)) !== HTTP_STATUS.OK) {
          return false;
        }

        const request = {
          method: HTTP_METHODS.POST,
          body: "{}",
          headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
        };
        const accepted = await readinessStatus(`${URLS.PDF_WORKER}/render/quotation-pdf`, request);
        const rejected = await readinessStatus(`${URLS.PDF_WORKER}/render/quotation-pdf`, {
          ...request,
          headers: { ...request.headers, authorization: `Bearer wrong-${token}` },
        });
        if (accepted !== HTTP_STATUS.BAD_REQUEST || rejected !== HTTP_STATUS.UNAUTHORIZED) {
          throw new Error("Worker runtime authentication proof failed");
        }

        return true;
      },
    });
    return server;
  } catch (error) {
    await stopChildProcess(server);
    throw error;
  }
};
