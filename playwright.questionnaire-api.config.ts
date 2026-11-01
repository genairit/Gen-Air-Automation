import { defineConfig } from "@playwright/test";
import { REPORTERS } from "./src/constants/playwright.constant.ts";
import { STACK_TIMEOUTS, AUTOMATION_DIRECTORIES } from "./src/constants/environment.constant.ts";

export default defineConfig({
  testDir: "./tests/questionnaire",
  testMatch: "questionnaire-api.spec.ts",
  outputDir: AUTOMATION_DIRECTORIES.RESULTS,
  reporter: REPORTERS,
  workers: 1,
  retries: 0,
  timeout: STACK_TIMEOUTS.TEST_MS,
});
