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
  await workspaceTab(page, tab).click();
};
