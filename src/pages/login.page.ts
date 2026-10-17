import type { Page } from "@playwright/test";
import { ROUTES } from "../constants/routes.constant.ts";
import { LOGIN_COPY } from "../constants/copy.constant.ts";
import type { ICredentials } from "../interfaces/test-user.interface.ts";

export const createLoginPage = (page: Page) => {
  const passwordInput = page.locator("input[type=password]");
  const emailInput = page.getByPlaceholder(LOGIN_COPY.EMAIL_PLACEHOLDER);
  const heading = page.getByRole("heading", { name: LOGIN_COPY.TITLE });
  const submitButton = page.getByRole("button", { name: LOGIN_COPY.SUBMIT });

  const goto = () => page.goto(ROUTES.LOGIN);

  const login = async (credentials: ICredentials) => {
    await emailInput.fill(credentials.email);
    await passwordInput.fill(credentials.password);
    await submitButton.click();
  };

  return { heading, submitButton, goto, login };
};
