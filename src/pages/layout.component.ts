import type { Page, Locator } from "@playwright/test";

export const findMainContent = (page: Page): Locator => page.locator("main");
