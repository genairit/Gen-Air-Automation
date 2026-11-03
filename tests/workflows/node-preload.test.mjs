import { test } from "node:test";
import { join } from "node:path";
import { tmpdir } from "node:os";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { buildNodePreloadOptions } from "../../src/utilities/node-preload.utility.ts";

test("Node preloads a module from a space-containing checkout path without a shell", async () => {
  const directory = await mkdtemp(join(tmpdir(), "gen air preload "));
  try {
    const path = join(directory, "fixture preload.mjs");
    await writeFile(path, "globalThis.qaPreloadLoaded = true;");
    const result = spawnSync(
      process.execPath,
      ["--input-type=module", "-e", "process.stdout.write(String(globalThis.qaPreloadLoaded));"],
      { cwd: directory, encoding: "utf8", env: { NODE_OPTIONS: buildNodePreloadOptions(path) } },
    );
    assert.equal(result.error ?? null, null, result.error?.message);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stdout, "true");
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
