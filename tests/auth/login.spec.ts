import { ROUTES } from "../../src/constants/routes.constant.ts";
import { createLoginPage } from "../../src/pages/login.page.ts";
import { test, expect } from "../../src/fixtures/test.fixture.ts";
import { BOARD_COPY } from "../../src/constants/copy.constant.ts";
import { createAppShell } from "../../src/pages/app-shell.page.ts";
import { USER_ROLES } from "../../src/constants/user-role.constant.ts";
import { TEST_USERS } from "../../src/constants/test-users.constant.ts";
import { EMPTY_AUTH_STATE } from "../../src/constants/auth-state.constant.ts";

const ADMIN = TEST_USERS[USER_ROLES.SYSTEM_ADMIN];

const WRONG_PASSWORD = "wrong-password";

test.describe("login", () => {
  test.use({ storageState: EMPTY_AUTH_STATE });

  test("valid credentials land on the board", async ({ page }) => {
    const loginPage = createLoginPage(page);

    await loginPage.goto();
    await loginPage.login(ADMIN);

    await expect(page).toHaveURL(ROUTES.BOARD);
    await expect(page.getByText(BOARD_COPY.TITLE)).toBeVisible();
  });

  test("invalid credentials show an error and stay on login", async ({ page }) => {
    const loginPage = createLoginPage(page);

    await loginPage.goto();
    await loginPage.login({ email: ADMIN.email, password: WRONG_PASSWORD });

    await expect(page.getByRole("alert")).toBeVisible();
    await expect(page).toHaveURL(ROUTES.LOGIN);
  });

  test("the submit button stays disabled until both fields are filled", async ({ page }) => {
    const loginPage = createLoginPage(page);

    await loginPage.goto();

    await expect(loginPage.submitButton).toBeDisabled();
  });

  test("protected routes redirect to login without a session", async ({ page }) => {
    const loginPage = createLoginPage(page);

    await page.goto(ROUTES.TASKS);

    await expect(page).toHaveURL(ROUTES.LOGIN);
    await expect(loginPage.heading).toBeVisible();
  });
});

test("logout clears the session", async ({ page }) => {
  const appShell = createAppShell(page);
  const loginPage = createLoginPage(page);

  await page.goto(ROUTES.BOARD);
  await appShell.logoutButton.click();

  await expect(loginPage.heading).toBeVisible();

  await page.goto(ROUTES.BOARD);

  await expect(page).toHaveURL(ROUTES.LOGIN);
});
