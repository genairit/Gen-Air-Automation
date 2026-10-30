import { defineConfig } from "@playwright/test";
import { REPORTERS } from "./src/constants/playwright.constant.ts";
import { STACK_TIMEOUTS, AUTOMATION_DIRECTORIES } from "./src/constants/environment.constant.ts";

export default defineConfig({
  testDir: "./tests",
  testMatch: [
    "**/apartment-import-api.spec.ts",
    "**/customer-contacts-api.spec.ts",
    "**/customer-contact-list-api.spec.ts",
    "**/customer-projects-api.spec.ts",
    "**/import-permissions-api.spec.ts",
    "**/feature-permissions-api.spec.ts",
    "**/feature-permissions-migration.spec.ts",
  ],
  outputDir: AUTOMATION_DIRECTORIES.RESULTS,
  reporter: REPORTERS,
  workers: 1,
  retries: 0,
  timeout: STACK_TIMEOUTS.TEST_MS,
  expect: { timeout: STACK_TIMEOUTS.EXPECT_MS },
});
