import { ROUTES } from "./routes.constant.ts";

export const HOSTED_URL = process.env.GEN_AIR_HOSTED_URL ?? null;

const HOSTED_FOLDER = "hosted";

export const HOSTED_TESTS = {
  DIRECTORY: `./tests/${HOSTED_FOLDER}`,
  IGNORE_PATTERN: `**/${HOSTED_FOLDER}/**`,
} as const;

export const HOSTED_PROBES = {
  MISSING_ASSET_PATH: "/assets/missing-chunk.js",
} as const;

export const HOSTED_CLIENT_ROUTES = [
  ROUTES.TASKS,
  ROUTES.SETTINGS,
  ROUTES.CUSTOMERS,
  ROUTES.EMPLOYEES,
  ROUTES.NEW_PROJECT,
] as const;

// Matches no account, so the login probe reaches the database without creating or changing data.
export const UNKNOWN_CREDENTIALS = {
  email: "unknown-user@example.invalid",
  password: "not-a-registered-password",
} as const;
