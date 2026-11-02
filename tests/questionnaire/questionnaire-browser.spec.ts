import {
  submissionInput,
  activateQuestionnaire,
  readQuestionnaireSubmissions,
} from "../../src/environment/questionnaire-fixture.ts";

import { test, expect } from "@playwright/test";
import { QUESTIONNAIRE } from "../../src/constants/questionnaire.constant.ts";

const state = { questionnaireId: "" };

test.beforeAll(async () => {
  state.questionnaireId = (await activateQuestionnaire()).id;
});

test("branded questionnaire accepts unauthenticated employee input and shows real persisted receipt", async ({
  page,
}, testInfo) => {
  const input = submissionInput(state.questionnaireId);
  await page.goto("/");
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  await expect(page.locator("#send")).toBeEnabled();
  await expect(page.locator("textarea")).toHaveCount(7);
  await page.locator("#fullName").fill(input.fullName);
  await page.locator("#role").fill(input.role);
  await page.locator("#department").fill(input.department);
  await page.locator("#answer1").fill(input.answers[0].value);
  await page.screenshot({ path: testInfo.outputPath("questionnaire-desktop.png"), fullPage: true });
  await page.locator("#send").click();
  await expect(page.locator("#status")).toContainText("אישור קבלה:");
  await expect(page.locator("#send")).toBeDisabled();
  const rows = await readQuestionnaireSubmissions(input.fullName);
  expect(rows).toHaveLength(1);
  expect(rows[0]?.answers).toEqual(input.answers);
  await expect(page.locator("#status")).toContainText(rows[0]!.id);
});

test("lost response followed by page reload retries without a second database submission", async ({
  page,
}) => {
  const input = submissionInput(state.questionnaireId);
  await page.goto("/");
  await expect(page.locator("#send")).toBeEnabled();
  await page.locator("#fullName").fill(input.fullName);
  await page.locator("#role").fill(input.role);
  await page.locator("#department").fill(input.department);
  await page.locator("#answer1").fill(input.answers[0].value);
  await page.route(
    `**${QUESTIONNAIRE.SUBMIT_PATH}`,
    async route => {
      await route.fetch();
      await route.abort("failed");
    },
    { times: 1 },
  );
  await page.locator("#send").click();
  await expect(page.locator("#status")).toContainText("לא התקבל אישור קבלה");
  await expect(page.locator("#answer1")).toBeDisabled();
  page.once("dialog", dialog => dialog.accept());
  await page.reload();
  await expect(page.locator("#send")).toBeEnabled();
  await expect(page.locator("#answer1")).toHaveValue(input.answers[0].value);
  await page.locator("#send").click();
  await expect(page.locator("#status")).toContainText("אישור קבלה:");
  expect(await readQuestionnaireSubmissions(input.fullName)).toHaveLength(1);
});

test("mobile questionnaire keeps all controls readable inside viewport", async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await expect(page.locator("#send")).toBeEnabled();
  await expect(page.locator(".mobile-logo")).toBeVisible();
  const dimensions = await page.evaluate(() => ({
    width: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.width);
  await page.locator("#send").scrollIntoViewIfNeeded();
  await expect(page.locator("#send")).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("questionnaire-mobile.png"), fullPage: true });
});
