import type { Page } from "@playwright/test";
import { ROUTES } from "../constants/routes.constant.ts";
import { SETTINGS_COPY } from "../constants/copy.constant.ts";

export const createSettingsPage = (page: Page) => {
  const currentPasswordInput = page.getByPlaceholder(SETTINGS_COPY.CURRENT_PASSWORD_PLACEHOLDER);
  const newPasswordInput = page.getByPlaceholder(SETTINGS_COPY.NEW_PASSWORD_PLACEHOLDER);
  const confirmPasswordInput = page.getByPlaceholder(SETTINGS_COPY.CONFIRM_PASSWORD_PLACEHOLDER);
  const updateButton = page.getByRole("button", { name: SETTINGS_COPY.UPDATE_PASSWORD });
  const incorrectCurrentPassword = page.getByText(SETTINGS_COPY.CURRENT_PASSWORD_INCORRECT);
  const reauthenticationNotice = page.getByText(SETTINGS_COPY.PASSWORD_CHANGED_SIGN_IN_AGAIN);

  const goto = () => page.goto(ROUTES.SETTINGS);

  const fillPasswords = async (current: string, password: string, confirmation: string) => {
    await currentPasswordInput.fill(current);
    await newPasswordInput.fill(password);
    await confirmPasswordInput.fill(confirmation);
  };

  return {
    goto,
    updateButton,
    fillPasswords,
    newPasswordInput,
    currentPasswordInput,
    reauthenticationNotice,
    incorrectCurrentPassword,
  };
};
