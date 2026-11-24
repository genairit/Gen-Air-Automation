import { join } from "node:path";
import { once } from "node:events";
import { spawn } from "node:child_process";
import { test, expect } from "@playwright/test";
import { mkdir, open, readFile } from "node:fs/promises";
import { TIME_UNITS } from "../../src/constants/time.constant.ts";
import { stopChildProcess } from "../../src/environment/stop-child-process.ts";
import { PORTS, AUTOMATION_DIRECTORIES } from "../../src/constants/environment.constant.ts";

test("durable review intent survives broker outage and Backend restart; failed result adoption is redelivered", async ({}, testInfo): Promise<void> => {
  test.setTimeout(8 * TIME_UNITS.MINUTE_MS);
  const root = join(AUTOMATION_DIRECTORIES.DATABASE, "..", "recovery-stack");
  await mkdir(root, { recursive: true });
  const logPath = join(root, "private-process.log");
  const log = await open(logPath, "w");
  const child = spawn(
    process.execPath,
    [join(import.meta.dirname, "../../src/environment/publication-recovery-runner.ts")],
    {
      stdio: ["ignore", log.fd, log.fd],
      env: {
        ...process.env,
        GEN_AIR_ARTIFACTS_DIR: root,
        GEN_AIR_RECOVERY_LOG_PATH: logPath,
        GEN_AIR_BACKEND_PORT: String(PORTS.BACKEND + 200),
        GEN_AIR_DATABASE_PORT: String(PORTS.DATABASE + 200),
        GEN_AIR_FAKE_PLACES_PORT: String(PORTS.FAKE_PLACES + 200),
        GEN_AIR_PDF_WORKER_PORT: String(PORTS.PDF_WORKER + 200),
        GEN_AIR_SMTP_PORT: String(PORTS.SMTP + 200),
      },
    },
  );
  const deadline = setTimeout((): boolean => child.kill("SIGTERM"), 7 * TIME_UNITS.MINUTE_MS);
  try {
    const [code] = await once(child, "exit");
    expect(code, `Recovery runner failed; private diagnostic: ${logPath}`).toBe(0);
    const markers = (await readFile(logPath, "utf8"))
      .split("\n")
      .filter((line): boolean => line.startsWith('{"publicationRecovery":'));
    expect(markers).toHaveLength(1);
    const proof: unknown = JSON.parse(markers[0]);
    expect(proof).toMatchObject({
      publicationRecovery: "passed",
      businessCommitWhileOffline: true,
      offlineDispatcherObserved: true,
      backendRestart: true,
      adoptionFailureObserved: true,
      adoptionAttempts: 2,
      resultRedeliveries: 1,
      renderDeliveries: 1,
      fileCreates: 1,
      acceptedHashVerified: true,
    });
    await testInfo.attach("publication-recovery-proof", {
      body: JSON.stringify(proof),
      contentType: "application/json",
    });
  } finally {
    clearTimeout(deadline);
    await stopChildProcess(child);
    await log.close();
  }
});
