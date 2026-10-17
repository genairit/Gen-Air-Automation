import { resolve } from "node:path";
import { TIME_UNITS } from "./time.constant.ts";

const AUTOMATION_ROOT = resolve(import.meta.dirname, "../..");
const REPOSITORIES_ROOT = resolve(AUTOMATION_ROOT, "..");

export const IS_CI = process.env.CI === "true";

export const APP_DIRECTORIES = {
  BACKEND: process.env.GEN_AIR_BACKEND_DIR ?? resolve(REPOSITORIES_ROOT, "Gen-Air-Backend"),
  FRONTEND: process.env.GEN_AIR_FRONTEND_DIR ?? resolve(REPOSITORIES_ROOT, "Gen-Air-Frontend"),
} as const;

export const AUTOMATION_DIRECTORIES = {
  AUTH: resolve(AUTOMATION_ROOT, ".auth"),
  DATABASE: resolve(AUTOMATION_ROOT, ".database"),
} as const;

export const PORTS = {
  BACKEND: 3100,
  FRONTEND: 5180,
  DATABASE: 54329,
  FAKE_PLACES: 4100,
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
