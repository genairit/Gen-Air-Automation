import type { Page, Locator } from "@playwright/test";
import { STAGE_REASON_COPY } from "../constants/stage-reason.constant.ts";

export const createStageReasonDialog = (page: Page, title: string = STAGE_REASON_COPY.TITLE) => {
  const dialog = page.getByRole("dialog", { name: title });
  const reasonInput = dialog.getByRole("textbox", { name: STAGE_REASON_COPY.LABEL });
  const confirmButton = dialog.getByRole("button", { name: STAGE_REASON_COPY.CONFIRM });
  const cancelButton = dialog.getByRole("button", { name: STAGE_REASON_COPY.CANCEL });
  const closeButton = dialog.getByRole("button", { name: STAGE_REASON_COPY.CLOSE });
  const requiredError = dialog.getByText(STAGE_REASON_COPY.REQUIRED_ERROR, { exact: true });

  const counter = (text: string) => dialog.getByText(text, { exact: true });

  const confirm = async (reason: string) => {
    await reasonInput.fill(reason);
    await confirmButton.click();
  };

  return {
    dialog,
    reasonInput,
    closeButton,
    cancelButton,
    requiredError,
    confirmButton,
    counter,
    confirm,
  };
};

export const findWaitingReasonBanner = (scope: Page | Locator): Locator =>
  scope.getByRole("status").filter({ hasText: STAGE_REASON_COPY.BANNER_TITLE });

export const findTimelineReason = (timeline: Locator, note: string): Locator =>
  timeline
    .getByRole("listitem")
    .filter({ hasText: STAGE_REASON_COPY.TIMELINE_LABEL })
    .filter({ hasText: note });
