import test from "node:test";
import { once } from "node:events";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { TIME_UNITS } from "../../src/constants/time.constant.ts";
import { stopChildProcess } from "../../src/environment/stop-child-process.ts";

test("isolated stack waits for a child's SIGTERM drain before returning", async () => {
  const child = spawn(
    process.execPath,
    [
      "--input-type=module",
      "-e",
      `
    process.on("SIGTERM", () => {
      process.send("draining");
      setImmediate(() => process.exit(0));
    });
    process.send("ready");
    setInterval(() => {}, ${TIME_UNITS.MINUTE_MS});
  `,
    ],
    { stdio: ["ignore", "ignore", "ignore", "ipc"] },
  );
  try {
    const [ready] = await once(child, "message");
    assert.equal(ready, "ready");
    const drained = once(child, "message");
    await stopChildProcess(child);
    assert.equal((await drained)[0], "draining");
    assert.equal(child.exitCode, 0);
    await stopChildProcess(child);
    await stopChildProcess(null);
  } finally {
    if (child.exitCode === null && child.signalCode === null) {
      child.kill("SIGKILL");
    }
  }
});

test("drain timeout rejects only after owned child force exit", async () => {
  const child = spawn(
    process.execPath,
    [
      "-e",
      `process.on('SIGTERM',()=>{});process.send('ready');setInterval(()=>{},${TIME_UNITS.MINUTE_MS})`,
    ],
    { stdio: ["ignore", "ignore", "ignore", "ipc"] },
  );
  await once(child, "message");
  await assert.rejects(
    stopChildProcess(child, { drainMs: TIME_UNITS.SECOND_MS / 20, forceMs: TIME_UNITS.SECOND_MS }),
    /forced exit observed/,
  );
  assert.equal(child.signalCode, "SIGKILL");
});
