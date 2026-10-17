import {
  URLS,
  PORTS,
  LOCAL_HOST,
  TEST_SECRETS,
  TEST_DATABASE,
  APP_DIRECTORIES,
  AUTOMATION_DIRECTORIES,
} from "../constants/environment.constant.ts";

import { join } from "node:path";
import { mkdir } from "node:fs/promises";
import { spawn, spawnSync } from "node:child_process";

const BACKEND_ENTRY = join(APP_DIRECTORIES.BACKEND, "dist", "main.js");

// The backend prefers a .env in its working directory over process.env, so it runs from an empty one.
const RUNTIME_DIRECTORY = join(AUTOMATION_DIRECTORIES.DATABASE, "backend-runtime");

const RATE_LIMIT_MULTIPLIER = "1000";

const buildBackendEnvironment = () => ({
  ...process.env,
  PORT: String(PORTS.BACKEND),
  DB_HOST: LOCAL_HOST,
  DB_PORT: String(PORTS.DATABASE),
  DB_NAME: TEST_DATABASE.NAME,
  DB_USER: TEST_DATABASE.USER,
  DB_PASS: TEST_DATABASE.PASSWORD,
  JWT_SECRET: TEST_SECRETS.JWT,
  GOOGLE_PLACES_BASE_URL: URLS.FAKE_PLACES,
  GOOGLE_PLACES_API_KEY: TEST_SECRETS.PLACES_API_KEY,
  RATE_LIMIT_MAX_REQUESTS_MULTIPLIER: RATE_LIMIT_MULTIPLIER,
});

export const buildBackend = () => {
  const build = spawnSync("npm", ["run", "build"], {
    stdio: "inherit",
    cwd: APP_DIRECTORIES.BACKEND,
  });

  if (build.status !== 0) {
    throw new Error("Gen-Air-Backend build failed");
  }
};

export const startBackend = async () => {
  await mkdir(RUNTIME_DIRECTORY, { recursive: true });

  return spawn(process.execPath, [BACKEND_ENTRY], {
    stdio: "inherit",
    cwd: RUNTIME_DIRECTORY,
    env: buildBackendEnvironment(),
  });
};
