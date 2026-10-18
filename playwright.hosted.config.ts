import { defineConfig, devices } from "@playwright/test";
import { HOSTED_URL, HOSTED_TESTS } from "./src/constants/hosted.constant.ts";
import { REPORTERS, BROWSER_OPTIONS } from "./src/constants/playwright.constant.ts";
import { STACK_TIMEOUTS, AUTOMATION_DIRECTORIES } from "./src/constants/environment.constant.ts";

if (HOSTED_URL === null) {
  throw new Error("Set GEN_AIR_HOSTED_URL to the deployed Gen-Air-Frontend URL");
}

export default defineConfig({
  retries: 0,
  workers: 1,
  forbidOnly: true,
  reporter: REPORTERS,
  testDir: HOSTED_TESTS.DIRECTORY,
  outputDir: AUTOMATION_DIRECTORIES.RESULTS,
  timeout: STACK_TIMEOUTS.TEST_MS,
  expect: { timeout: STACK_TIMEOUTS.EXPECT_MS },
  use: { ...BROWSER_OPTIONS, baseURL: HOSTED_URL },
  projects: [{ name: "hosted", use: { ...devices["Desktop Chrome"] } }],
});
