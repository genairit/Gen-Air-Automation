import { seedUser } from "../../src/api/seed-data.ts";
import { createLoginPage } from "../../src/pages/login.page.ts";
import { test, expect } from "../../src/fixtures/test.fixture.ts";
import { createAppShell } from "../../src/pages/app-shell.page.ts";
import { SETTINGS_COPY } from "../../src/constants/copy.constant.ts";
import { createSettingsPage } from "../../src/pages/settings.page.ts";
import { findMainContent } from "../../src/pages/layout.component.ts";
import { USER_ROLES } from "../../src/constants/user-role.constant.ts";
import { PROJECT_STATUS_NAMES } from "../../src/constants/domain.constant.ts";

const NEW_PASSWORD = "Changed456!";

const MISMATCHED_CONFIRMATION = `${NEW_PASSWORD}x`;

const STATUSES_IN_ORDER = new RegExp(
  [
    PROJECT_STATUS_NAMES.DRAFT,
    PROJECT_STATUS_NAMES.PENDING,
    PROJECT_STATUS_NAMES.IN_PROGRESS,
    PROJECT_STATUS_NAMES.ON_HOLD,
    PROJECT_STATUS_NAMES.DONE,
  ].join(".*"),
);

test("the project statuses card lists the five fixed statuses in order", async ({ page }) => {
  const settingsPage = createSettingsPage(page);

  await settingsPage.goto();

  await expect(page.getByText(SETTINGS_COPY.STAGES_TITLE)).toBeVisible();
  await expect(findMainContent(page)).toContainText(STATUSES_IN_ORDER);
});

test("mismatched passwords keep the update button disabled", async ({ page }) => {
  const settingsPage = createSettingsPage(page);

  await settingsPage.goto();
  await settingsPage.fillPasswords(NEW_PASSWORD, MISMATCHED_CONFIRMATION);

  await expect(settingsPage.updateButton).toBeDisabled();
});

test("change the password and log in with the new one", async ({ api, openPageAs }) => {
  const user = await seedUser(api, USER_ROLES.SECRETARY);
  const page = await openPageAs(user);
  const settingsPage = createSettingsPage(page);
  const loginPage = createLoginPage(page);

  await settingsPage.goto();
  await settingsPage.fillPasswords(NEW_PASSWORD, NEW_PASSWORD);
  await settingsPage.updateButton.click();

  await expect(settingsPage.successMessage).toBeVisible();

  await createAppShell(page).logoutButton.click();
  await loginPage.login(user);

  await expect(page.getByRole("alert")).toBeVisible();

  await loginPage.login({ email: user.email, password: NEW_PASSWORD });

  await expect(loginPage.heading).toBeHidden();
});
