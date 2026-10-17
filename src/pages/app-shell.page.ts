import type { Page } from "@playwright/test";
import { NAVIGATION_COPY } from "../constants/copy.constant.ts";

type NavigationItemType = Exclude<keyof typeof NAVIGATION_COPY, "LOGOUT">;

export const createAppShell = (page: Page) => {
  const navigation = page.getByRole("complementary").getByRole("navigation");
  const logoutButton = page.getByRole("button", { name: NAVIGATION_COPY.LOGOUT });

  const navigateTo = (item: NavigationItemType) =>
    navigation.getByRole("button", { name: NAVIGATION_COPY[item] }).click();

  return { navigation, logoutButton, navigateTo };
};
