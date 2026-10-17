import type { Page } from "@playwright/test";
import { ROUTES } from "../constants/routes.constant.ts";
import { SETTINGS_COPY } from "../constants/copy.constant.ts";

export const createSettingsPage = (page: Page) => {
  const newPasswordInput = page.getByPlaceholder(SETTINGS_COPY.NEW_PASSWORD_PLACEHOLDER);
  const confirmPasswordInput = page.getByPlaceholder(SETTINGS_COPY.CONFIRM_PASSWORD_PLACEHOLDER);
  const updateButton = page.getByRole("button", { name: SETTINGS_COPY.UPDATE_PASSWORD });
  const successMessage = page.getByText(SETTINGS_COPY.PASSWORD_UPDATED);

  const goto = () => page.goto(ROUTES.SETTINGS);

  const fillPasswords = async (password: string, confirmation: string) => {
    await newPasswordInput.fill(password);
    await confirmPasswordInput.fill(confirmation);
  };

  return { updateButton, successMessage, goto, fillPasswords };
};
