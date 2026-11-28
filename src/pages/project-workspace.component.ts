import { expect } from "@playwright/test";
import type { Page } from "@playwright/test";

const TAB_LABELS = {
  tasks: "משימות",
  files: "קבצים",
  apartments: "דירות",
  quotations: "הצעות מחיר",
  details: "פרטים",
  people: "אנשי קשר וצוות",
  history: "היסטוריה",
  technical: "נתונים טכניים",
} as const;

export const workspaceTab = (page: Page, tab: keyof typeof TAB_LABELS) =>
  page.getByRole("tab", { name: TAB_LABELS[tab], exact: true });

export const openWorkspaceTab = async (page: Page, tab: keyof typeof TAB_LABELS) => {
  if (tab === "details") {
    const tabControl = workspaceTab(page, tab);
    const disclosure = page.locator("summary").filter({ hasText: /^פרטים נוספים$/ });
    await expect(tabControl.or(disclosure)).toBeVisible();
    if (await tabControl.isVisible()) await tabControl.click();
    else if (!(await disclosure.evaluate(el => el.parentElement?.hasAttribute("open"))))
      await disclosure.click();
    return;
  }
  await workspaceTab(page, tab).click();
};
