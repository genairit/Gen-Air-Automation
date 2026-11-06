import type { Page } from "@playwright/test";
import { USER_ROLE_LABELS, type UserRoleType } from "../constants/user-role.constant.ts";

export const createRoleMenu = (page: Page) => {
  const trigger = page.locator('button[aria-haspopup="menu"]');
  const option = (role: UserRoleType) =>
    page.getByRole("menuitemradio", { name: USER_ROLE_LABELS[role], exact: true });

  const open = async () => {
    await trigger.click();
  };

  const select = async (role: UserRoleType) => {
    await open();
    await option(role).click();
  };

  return { open, select, option, trigger, menu: page.getByRole("menu") };
};
