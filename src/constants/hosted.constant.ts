import { ROUTES } from "./routes.constant.ts";

export const HOSTED_URL = process.env.GEN_AIR_HOSTED_URL ?? null;

export const HOSTED_TESTS = {
  DIRECTORY: "./tests/hosted",
  IGNORE_PATTERN: "**/hosted/**",
} as const;

export const SECURE_PROTOCOL = "https:";

export const HTML_CONTENT_TYPE = "text/html";

export const MISSING_ASSET_PATH = "/assets/missing-chunk.js";

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
