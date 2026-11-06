import type { Page } from "@playwright/test";
import { createTaskPage } from "./tasks.page.ts";

const EMAIL_TITLE = "שליחת תוכנית מיזוג אוויר לביצוע";

export const createQuotationEmailPage = (page: Page) => {
  const dialog = page.getByRole("dialog", { name: EMAIL_TITLE });
  const sendButton = dialog.getByRole("button", { name: "שלח מייל" });
  const nextButton = dialog.getByRole("button", { name: "המשך לבחירת קבצים" });

  const open = async (taskId: string) => {
    await createTaskPage(page).goto(taskId);
    await page.getByRole("button", { name: "שליחת תוכנית לביצוע במייל" }).click();
  };

  const chooseArchitect = async (name: string) => {
    await dialog.getByRole("checkbox", { name: new RegExp(name) }).check();
    await dialog.getByRole("button", { name: "סמן כאדריכל" }).click();
  };

  const setVersion = (version: string) => dialog.getByPlaceholder("לדוגמה: 03").fill(version);
  const continueToFiles = () => nextButton.click();
  const openNestedFolder = () => dialog.getByRole("button", { name: "📁 תיקיית משנה" }).click();
  const choosePlan = () =>
    dialog.getByRole("button", { name: "תוכנית: תוכנית לביצוע.pdf" }).click();
  const chooseZip = () => dialog.getByRole("button", { name: "ZIP: מסמכים.zip" }).click();
  const cancel = () => dialog.getByRole("button", { name: "ביטול" }).click();

  return {
    dialog,
    sendButton,
    nextButton,
    open,
    cancel,
    chooseZip,
    choosePlan,
    setVersion,
    chooseArchitect,
    continueToFiles,
    openNestedFolder,
  };
};
