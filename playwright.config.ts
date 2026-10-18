import {
  REPORTERS,
  BROWSER_OPTIONS,
  DESKTOP_BROWSER,
} from "./src/constants/playwright.constant.ts";

import {
  URLS,
  PORTS,
  IS_CI,
  STACK_TIMEOUTS,
  APP_DIRECTORIES,
  AUTOMATION_DIRECTORIES,
} from "./src/constants/environment.constant.ts";

import { defineConfig } from "@playwright/test";
import { HOSTED_TESTS } from "./src/constants/hosted.constant.ts";

export default defineConfig({
  testDir: "./tests",
  testIgnore: HOSTED_TESTS.IGNORE_PATTERN,
  outputDir: AUTOMATION_DIRECTORIES.RESULTS,
  workers: 1,
  fullyParallel: false,
  forbidOnly: IS_CI,
  retries: IS_CI ? 1 : 0,
  timeout: STACK_TIMEOUTS.TEST_MS,
  expect: { timeout: STACK_TIMEOUTS.EXPECT_MS },
  reporter: REPORTERS,
  use: {
    ...BROWSER_OPTIONS,
    baseURL: URLS.FRONTEND,
    video: "retain-on-failure",
  },
  projects: [
    { name: "setup", testMatch: /.*\.setup\.ts/ },
    {
      name: "chromium",
      dependencies: ["setup"],
      use: DESKTOP_BROWSER,
    },
  ],
  webServer: [
    {
      command: "npm run stack",
      reuseExistingServer: !IS_CI,
      url: URLS.BACKEND,
      stdout: "pipe",
      timeout: STACK_TIMEOUTS.SERVER_START_MS,
    },
    {
      url: URLS.FRONTEND,
      reuseExistingServer: !IS_CI,
      cwd: APP_DIRECTORIES.FRONTEND,
      timeout: STACK_TIMEOUTS.SERVER_START_MS,
      env: { VITE_BACKEND_URL: URLS.BACKEND },
      command: `npx vite --port ${PORTS.FRONTEND} --strictPort`,
    },
  ],
});
