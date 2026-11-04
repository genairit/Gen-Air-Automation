import {
  REPORTERS,
  BROWSER_OPTIONS,
  DESKTOP_BROWSER,
} from "./src/constants/playwright.constant.ts";

import {
  URLS,
  TEST_SECRETS,
  STACK_TIMEOUTS,
  APP_DIRECTORIES,
  AUTOMATION_DIRECTORIES,
} from "./src/constants/environment.constant.ts";

import { join } from "node:path";
import { defineConfig } from "@playwright/test";
import { QUESTIONNAIRE } from "./src/constants/questionnaire.constant.ts";

export default defineConfig({
  testDir: "./tests/questionnaire",
  outputDir: AUTOMATION_DIRECTORIES.RESULTS,
  reporter: REPORTERS,
  workers: 1,
  retries: 0,
  timeout: STACK_TIMEOUTS.TEST_MS,
  expect: { timeout: STACK_TIMEOUTS.EXPECT_MS },
  use: { ...BROWSER_OPTIONS, ...DESKTOP_BROWSER, baseURL: QUESTIONNAIRE.CLIENT_ORIGIN },
  webServer: [
    {
      command: "npm run stack",
      gracefulShutdown: { signal: "SIGTERM", timeout: STACK_TIMEOUTS.SHUTDOWN_MS },
      url: URLS.BACKEND,
      reuseExistingServer: false,
      timeout: STACK_TIMEOUTS.SERVER_START_MS,
    },
    {
      command: "node server.js",
      cwd: join(APP_DIRECTORIES.BACKEND, "apps/questionnaire"),
      url: `${QUESTIONNAIRE.CLIENT_ORIGIN}/health`,
      reuseExistingServer: false,
      env: {
        BACKEND_URL: URLS.BACKEND,
        PORT: String(QUESTIONNAIRE.CLIENT_PORT),
        QUESTIONNAIRE_CLIENT_SECRET: TEST_SECRETS.QUESTIONNAIRE_CLIENT,
      },
    },
  ],
});
