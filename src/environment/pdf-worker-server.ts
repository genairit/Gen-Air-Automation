import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { spawn, spawnSync } from "node:child_process";
import type { ChildProcess } from "node:child_process";
import { TIME_UNITS } from "../constants/time.constant.ts";
import { URLS, PORTS, TEST_SECRETS, APP_DIRECTORIES } from "../constants/environment.constant.ts";

const ENTRY = join(import.meta.dirname, "pdf-worker-process.ts");

export const startPdfWorkerServer = async (): Promise<ChildProcess> => {
  const runId = randomUUID();
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
    cwd: APP_DIRECTORIES.WORKER,
    stdio: "inherit",
    env: {
      ...process.env,
      GEN_AIR_PDF_WORKER_PORT: String(PORTS.PDF_WORKER),
      GEN_AIR_PDF_WORKER_TOKEN: TEST_SECRETS.PDF_WORKER,
      GEN_AIR_PDF_WORKER_RUN_ID: runId,
    },
  });
  for (const _ of Array.from({ length: 50 })) {
    if (server.exitCode !== null) {
      throw new Error(`PDF worker process exited with ${server.exitCode}`);
    }
    if (
      await fetch(`${URLS.PDF_WORKER}/health/live`)
        .then(async result => result.ok && (await result.text()) === runId)
        .catch(() => false)
    ) {
      return server;
    }
    await new Promise(resolve => setTimeout(resolve, TIME_UNITS.SECOND_MS / 10));
  }
  server.kill();
  throw new Error("PDF worker process did not become ready");
};
