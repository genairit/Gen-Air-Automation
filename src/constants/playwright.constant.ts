import { HOSTED_TESTS } from "./hosted.constant.ts";
import { devices, type ReporterDescription } from "@playwright/test";
import { IS_CI, AUTOMATION_DIRECTORIES } from "./environment.constant.ts";

export const REPORTERS: ReporterDescription[] = [
  [IS_CI ? "github" : "list"],
  ["html", { open: "never", outputFolder: AUTOMATION_DIRECTORIES.HTML }],
  ["json", { outputFile: AUTOMATION_DIRECTORIES.JSON }],
];

export const BROWSER_OPTIONS = {
  locale: "he-IL",
  timezoneId: "Asia/Jerusalem",
  trace: "retain-on-failure",
  screenshot: "only-on-failure",
} as const;

export const DESKTOP_BROWSER = devices["Desktop Chrome"];

export const TEST_IGNORE_PATTERNS = [HOSTED_TESTS.IGNORE_PATTERN, "**/workflows/**"];
