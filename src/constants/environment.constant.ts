import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { createHash } from "node:crypto";
import { TIME_UNITS } from "./time.constant.ts";
import { readPort } from "../utilities/port.utility.ts";

const AUTOMATION_ROOT = resolve(import.meta.dirname, "../..");
const REPOSITORIES_ROOT = resolve(AUTOMATION_ROOT, "..");

export const IS_CI = process.env.CI === "true";
export const EMAIL_QA_ENABLED = process.env.GEN_AIR_EMAIL_QA !== "false";

export const APP_DIRECTORIES = {
  BACKEND: process.env.GEN_AIR_BACKEND_DIR ?? resolve(REPOSITORIES_ROOT, "Gen-Air-Backend"),
  FRONTEND: process.env.GEN_AIR_FRONTEND_DIR ?? resolve(REPOSITORIES_ROOT, "Gen-Air-Frontend"),
} as const;

const CHECKOUT_ID = createHash("sha256").update(AUTOMATION_ROOT).digest("hex").slice(0, 12);
const PORT_OFFSET = Number(process.env.GEN_AIR_QA_PORT_OFFSET ?? 0);
const ARTIFACTS_ROOT = resolve(
  process.env.GEN_AIR_ARTIFACTS_DIR ?? resolve(tmpdir(), "gen-air-automation", CHECKOUT_ID),
);

export const AUTOMATION_DIRECTORIES = {
  AUTH: resolve(ARTIFACTS_ROOT, "auth"),
  HTML: resolve(ARTIFACTS_ROOT, "html"),
  JSON: resolve(ARTIFACTS_ROOT, "results.json"),
  RESULTS: resolve(ARTIFACTS_ROOT, "test-results"),
  DATABASE: resolve(ARTIFACTS_ROOT, "database"),
  MAIL: resolve(ARTIFACTS_ROOT, "mail"),
} as const;

export const PORTS = {
  BACKEND: readPort(
    "GEN_AIR_BACKEND_PORT",
    process.env.GEN_AIR_BACKEND_PORT ?? null,
    3100 + PORT_OFFSET,
  ),
  FRONTEND: readPort(
    "GEN_AIR_FRONTEND_PORT",
    process.env.GEN_AIR_FRONTEND_PORT ?? null,
    5180 + PORT_OFFSET,
  ),
  DATABASE: readPort(
    "GEN_AIR_DATABASE_PORT",
    process.env.GEN_AIR_DATABASE_PORT ?? null,
    54329 + PORT_OFFSET,
  ),
  FAKE_PLACES: readPort(
    "GEN_AIR_FAKE_PLACES_PORT",
    process.env.GEN_AIR_FAKE_PLACES_PORT ?? null,
    4100 + PORT_OFFSET,
  ),
  SMTP: readPort("GEN_AIR_SMTP_PORT", process.env.GEN_AIR_SMTP_PORT ?? null, 2525 + PORT_OFFSET),
} as const;

export const LOCAL_HOST = "localhost";

const LOCAL_ORIGIN = `http://${LOCAL_HOST}`;

export const URLS = {
  BACKEND: `${LOCAL_ORIGIN}:${PORTS.BACKEND}`,
  FRONTEND: `${LOCAL_ORIGIN}:${PORTS.FRONTEND}`,
  FAKE_PLACES: `${LOCAL_ORIGIN}:${PORTS.FAKE_PLACES}/v1`,
} as const;

// Throwaway credentials for the ephemeral local database and test-only token signing; they protect nothing.
export const TEST_DATABASE = {
  FLAGS: ["-c", "unix_socket_directories="],
  INIT_FLAGS: ["--encoding=UTF8"],
  NAME: "gen_air_e2e",
  USER: "gen_air",
  PASSWORD: "gen_air",
} as const;

export const TEST_SECRETS = {
  JWT: "gen-air-automation-test-only-secret",
  PLACES_API_KEY: "fake-places-key",
} as const;

export const STACK_TIMEOUTS = {
  SERVER_START_MS: 4 * TIME_UNITS.MINUTE_MS,
  TEST_MS: TIME_UNITS.MINUTE_MS,
  EXPECT_MS: 10 * TIME_UNITS.SECOND_MS,
} as const;
