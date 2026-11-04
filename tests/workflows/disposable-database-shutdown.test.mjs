import test from "node:test";
import { tmpdir } from "node:os";
import { join } from "node:path";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";

test(
  "disposable Postgres stops even when its pid file is missing",
  { skip: process.platform !== "darwin" },
  async () => {
    const artifactsDirectory = await mkdtemp(join(tmpdir(), "genair-missing-postmaster-"));
    const previousArtifactsDirectory = process.env.GEN_AIR_ARTIFACTS_DIR ?? null;
    process.env.GEN_AIR_ARTIFACTS_DIR = artifactsDirectory;

    try {
      const { stopTestDatabase } = await import("../../src/environment/test-database.ts");
      const calls = [];
      const server = { stop: async () => calls.push("stopped") };

      await assert.rejects(
        stopTestDatabase(server),
        /Could not read disposable Postgres IPC identifiers/,
      );
      assert.deepEqual(calls, ["stopped"]);
    } finally {
      if (previousArtifactsDirectory === null) {
        delete process.env.GEN_AIR_ARTIFACTS_DIR;
      } else {
        process.env.GEN_AIR_ARTIFACTS_DIR = previousArtifactsDirectory;
      }
      await rm(artifactsDirectory, { recursive: true, force: true });
    }
  },
);
