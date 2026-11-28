import { expect, type Page } from "@playwright/test";
import { openWorkspaceTab } from "./project-workspace.component.ts";

export const expectApartmentTabLayout = async (page: Page): Promise<void> => {
  const tasks = page.getByRole("tabpanel", { name: "משימות", exact: true });
  await expect(tasks).toBeInViewport();
  await openWorkspaceTab(page, "details");
  const details = page.getByRole("tabpanel", { name: "פרטים", exact: true });
  const inherited = details.getByText("נתונים מהפרויקט האב", { exact: true });
  const customer = details.getByText("לקוח קצה — דירה זו", { exact: true });
  await expect(inherited).toBeVisible();
  await expect(customer).toBeVisible();
  const [inheritedBox, customerBox] = await Promise.all([
    inherited.boundingBox(),
    customer.boundingBox(),
  ]);
  if (!inheritedBox || !customerBox) throw new Error("Expected both apartment detail columns");
  expect(inheritedBox.x).toBeLessThan(customerBox.x);
  await openWorkspaceTab(page, "files");
  await expect(details).toBeHidden();
  await expect(page.getByRole("tabpanel", { name: "קבצים", exact: true })).toBeVisible();
};
