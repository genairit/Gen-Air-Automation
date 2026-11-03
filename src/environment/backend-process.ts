import {
  URLS,
  PORTS,
  LOCAL_HOST,
  TEST_SECRETS,
  TEST_DATABASE,
  APP_DIRECTORIES,
  EMAIL_QA_ENABLED,
  AUTOMATION_DIRECTORIES,
} from "../constants/environment.constant.ts";

import { join } from "node:path";
import { mkdir } from "node:fs/promises";
import { spawn, spawnSync } from "node:child_process";
import { buildNodePreloadOptions } from "../utilities/node-preload.utility.ts";

const BACKEND_ENTRY = join(APP_DIRECTORIES.BACKEND, "dist", "main.js");

// The backend prefers a .env in its working directory over process.env, so it runs from an empty one.
const RUNTIME_DIRECTORY = join(AUTOMATION_DIRECTORIES.DATABASE, "backend-runtime");

const RATE_LIMIT_MULTIPLIER = "1000";
const DRIVE_PRELOAD = join(import.meta.dirname, "fake-drive-preload.mjs");

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
  GOOGLE_DRIVE_SERVICE_ACCOUNT_JSON: "",
  GOOGLE_DRIVE_ROOT_FOLDER_ID: EMAIL_QA_ENABLED ? "qa-drive-root" : "",
  EMAIL_DELIVERY_MODE: EMAIL_QA_ENABLED ? "allowlist" : "disabled",
  EMAIL_ALLOWED_RECIPIENTS: EMAIL_QA_ENABLED
    ? "qa-architect@example.test,qa-other@example.test,qa-rejected@example.test"
    : "",
  SMTP_HOST: EMAIL_QA_ENABLED ? "127.0.0.1" : "",
  SMTP_PORT: EMAIL_QA_ENABLED ? String(PORTS.SMTP) : "",
  SMTP_FROM: EMAIL_QA_ENABLED ? "qa-sender@example.test" : "",
  SMTP_USER: "",
  SMTP_PASSWORD: "",
  NODE_OPTIONS: EMAIL_QA_ENABLED ? buildNodePreloadOptions(DRIVE_PRELOAD) : "",
  GEN_AIR_EMAIL_QA_FAIL_LOGO_MARKER: join(AUTOMATION_DIRECTORIES.MAIL, "fail-logo"),
});

export const buildBackend = () => {
  // Isolated candidate checkouts may use a prebuilt dist from an explicit external build.
  if (process.env.GEN_AIR_BACKEND_PREBUILT === "1") {
    return;
  }

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
