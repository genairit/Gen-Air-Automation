import { ROUTES } from "../../src/constants/routes.constant.ts";
import { createBoardPage } from "../../src/pages/board.page.ts";
import { seedMultiRoleUser } from "../../src/api/multi-role.ts";
import { test, expect } from "../../src/fixtures/test.fixture.ts";
import { VIEWPORTS } from "../../src/constants/viewport.constant.ts";
import { createRoleMenu } from "../../src/pages/role-menu.component.ts";
import { KEYBOARD_KEYS } from "../../src/constants/keyboard.constant.ts";
import { USER_ROLES, USER_ROLE_LABELS } from "../../src/constants/user-role.constant.ts";

const ADMIN = USER_ROLES.SYSTEM_ADMIN;
const FINANCE = USER_ROLES.FINANCE;

test("switching updates visible permissions, persists after reload, and synchronizes another tab", async ({
  api,
  openPageAs,
}) => {
  const user = await seedMultiRoleUser(api, [ADMIN, FINANCE]);
  const page = await openPageAs(user);
  await page.goto(ROUTES.BOARD);
  const board = createBoardPage(page);
  await expect(board.newProjectButton).toBeVisible();
  const second = await page.context().newPage();
  await second.goto(ROUTES.BOARD);
  await expect(createBoardPage(second).newProjectButton).toBeVisible();
  await createRoleMenu(page).select(FINANCE);
  await expect(board.newProjectButton).toHaveCount(0);
  await expect(createBoardPage(second).newProjectButton).toHaveCount(0);
  await page.reload();
  const menu = createRoleMenu(page);
  await menu.open();
  await expect(page.getByRole("menuitemradio")).toHaveCount(2);
  await expect(menu.option(FINANCE)).toHaveAttribute("aria-checked", "true");
  await expect(menu.option(ADMIN)).toHaveAttribute("aria-checked", "false");
});

test("single-role users keep their role label without a redundant selector", async ({
  api,
  openPageAs,
}) => {
  const user = await seedMultiRoleUser(api, [FINANCE]);
  const page = await openPageAs(user);
  await page.goto(ROUTES.BOARD);
  await expect(createBoardPage(page).searchBox).toBeVisible();
  await expect(page.getByRole("button", { name: new RegExp(user.firstName) })).toBeDisabled();
  await expect(page.getByText(USER_ROLE_LABELS[FINANCE], { exact: true }).first()).toBeVisible();
  await expect(page.getByRole("menuitemradio")).toHaveCount(0);
});

for (const viewport of [{ width: 1440, height: 900 }, VIEWPORTS.MOBILE]) {
  test(`RTL role menu supports keyboard dismissal and focus return at ${viewport.width}px`, async ({
    api,
    openPageAs,
  }) => {
    const user = await seedMultiRoleUser(api, [ADMIN, FINANCE]);
    const page = await openPageAs(user);
    await page.setViewportSize(viewport);
    await page.goto(ROUTES.BOARD);
    const menu = createRoleMenu(page);
    await menu.trigger.focus();
    await page.keyboard.press(KEYBOARD_KEYS.ENTER);
    await expect(menu.menu).toBeVisible();
    await expect(menu.option(ADMIN)).toHaveAttribute("aria-checked", "true");
    await expect(menu.option(FINANCE)).toBeVisible();
    const bounds = await menu.menu.boundingBox();
    expect(bounds).not.toBeNull();
    expect(bounds?.x).toBeGreaterThanOrEqual(0);
    expect((bounds?.x ?? 0) + (bounds?.width ?? 0)).toBeLessThanOrEqual(viewport.width);
    await page.keyboard.press(KEYBOARD_KEYS.ESCAPE);
    await expect(menu.menu).toHaveCount(0);
    await expect(menu.trigger).toBeFocused();
    await page.keyboard.press(KEYBOARD_KEYS.ENTER);
    await menu.option(FINANCE).focus();
    await page.keyboard.press(KEYBOARD_KEYS.ENTER);
    await expect(menu.menu).toHaveCount(0);
    await expect(createBoardPage(page).newProjectButton).toHaveCount(0);
    await page.reload();
    await expect(menu.trigger).toContainText(USER_ROLE_LABELS[FINANCE]);
  });
}
