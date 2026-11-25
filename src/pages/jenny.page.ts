import type { Page } from "@playwright/test";

const JENNY_COPY = {
  TITLE: "ג׳ני",
  LAUNCHER: "ג׳ני – עוזרת AI",
  INPUT: "הודעה לג׳ני",
  EMPTY: "היי, אני ג׳ני, איך אפשר לעזור בפרויקט הזה?",
  LOADING: "מחפשת במסמכים…",
  THREAD: "שיחה עם ג׳ני",
  SEND: "שליחה",
  RETRY: "נסו שוב",
} as const;

export const createJennyPage = (page: Page) => {
  const dialog = page.getByRole("dialog", { name: JENNY_COPY.TITLE });
  const launcher = page.getByRole("button", { name: JENNY_COPY.LAUNCHER });
  const input = dialog.getByRole("textbox", { name: JENNY_COPY.INPUT });
  const send = dialog.getByRole("button", { name: JENNY_COPY.SEND });
  const thread = dialog.getByRole("log", { name: JENNY_COPY.THREAD });
  const retry = dialog.getByRole("button", { name: JENNY_COPY.RETRY });
  const greeting = dialog.getByText(JENNY_COPY.EMPTY);
  const loading = dialog.getByRole("status").filter({ hasText: JENNY_COPY.LOADING });

  const ask = async (question: string): Promise<void> => {
    await input.fill(question);
    await send.click();
  };

  return { ask, dialog, greeting, input, launcher, loading, retry, thread };
};
