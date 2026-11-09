import { seedUser } from "../../src/api/seed-data.ts";
import { createLoginPage } from "../../src/pages/login.page.ts";
import { test, expect } from "../../src/fixtures/test.fixture.ts";
import { SETTINGS_COPY } from "../../src/constants/copy.constant.ts";
import { createSettingsPage } from "../../src/pages/settings.page.ts";
import { findMainContent } from "../../src/pages/layout.component.ts";
import { USER_ROLES } from "../../src/constants/user-role.constant.ts";
import { TEST_PASSWORD } from "../../src/constants/test-users.constant.ts";
import { PROJECT_STATUS_NAMES } from "../../src/constants/domain.constant.ts";

const NEW_PASSWORD = "Changed456!";

const MISMATCHED_CONFIRMATION = `${NEW_PASSWORD}x`;
const WRONG_CURRENT_PASSWORD = "NotCurrent456!";

const STATUS_NAMES_IN_ORDER = Object.values(PROJECT_STATUS_NAMES);
const STATUSES_IN_ORDER = new RegExp(STATUS_NAMES_IN_ORDER.join(".*"));

test("the project statuses card lists the four fixed statuses in order", async ({ page, api }) => {
  const settingsPage = createSettingsPage(page);

  await settingsPage.goto();

  await expect(page.getByText(SETTINGS_COPY.STAGES_TITLE)).toBeVisible();
  await expect(findMainContent(page)).toContainText(STATUSES_IN_ORDER);
  const statuses = await api.getProjectStages();
  expect(statuses.map(status => status.name)).toEqual(STATUS_NAMES_IN_ORDER);
});

test("mismatched passwords keep the update button disabled", async ({ page }) => {
  const settingsPage = createSettingsPage(page);

  await settingsPage.goto();
  await settingsPage.fillPasswords(TEST_PASSWORD, NEW_PASSWORD, MISMATCHED_CONFIRMATION);

  await expect(settingsPage.updateButton).toBeDisabled();
});

test("password change rejects wrong current password, signs out and revokes old login", async ({
  api,
  openPageAs,
}) => {
  const user = await seedUser(api, USER_ROLES.SECRETARY);
  const page = await openPageAs(user);
  const settingsPage = createSettingsPage(page);
  const loginPage = createLoginPage(page);

  await settingsPage.goto();
  await settingsPage.fillPasswords(WRONG_CURRENT_PASSWORD, NEW_PASSWORD, NEW_PASSWORD);
  await settingsPage.updateButton.click();

  await expect(settingsPage.incorrectCurrentPassword).toBeVisible();
  await expect(settingsPage.currentPasswordInput).toHaveValue(WRONG_CURRENT_PASSWORD);
  await expect(loginPage.heading).toHaveCount(0);

  await settingsPage.fillPasswords(user.password, NEW_PASSWORD, NEW_PASSWORD);
  await settingsPage.updateButton.click();

  await expect(loginPage.heading).toBeVisible();
  await expect(settingsPage.reauthenticationNotice).toBeVisible();
  await loginPage.login(user);

  await expect(page.getByRole("alert")).toBeVisible();

  await loginPage.login({ email: user.email, password: NEW_PASSWORD });

  await expect(loginPage.heading).toBeHidden();
});
