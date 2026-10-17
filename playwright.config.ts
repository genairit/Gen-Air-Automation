import {
  URLS,
  PORTS,
  IS_CI,
  STACK_TIMEOUTS,
  APP_DIRECTORIES,
} from "./src/constants/environment.constant.ts";

import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  workers: 1,
  fullyParallel: false,
  forbidOnly: IS_CI,
  retries: IS_CI ? 1 : 0,
  timeout: STACK_TIMEOUTS.TEST_MS,
  expect: { timeout: STACK_TIMEOUTS.EXPECT_MS },
  reporter: IS_CI
    ? [["github"], ["html", { open: "never" }]]
    : [["list"], ["html", { open: "never" }]],
  use: {
    locale: "he-IL",
    baseURL: URLS.FRONTEND,
    timezoneId: "Asia/Jerusalem",
    trace: "retain-on-failure",
    video: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    { name: "setup", testMatch: /.*\.setup\.ts/ },
    {
      name: "chromium",
      dependencies: ["setup"],
      use: { ...devices["Desktop Chrome"] },
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
