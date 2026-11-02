import { expect, type Page } from "@playwright/test";

export const expectApartmentColumnsBeforeDrive = async (page: Page): Promise<void> => {
  const inherited = await page.getByText("נתונים מהפרויקט האב", { exact: true }).boundingBox();
  const customer = await page.getByText("לקוח קצה — דירה זו", { exact: true }).boundingBox();
  const drive = await page.getByText("מבנה תיקיות ומסמכי פרויקט", { exact: true }).boundingBox();
  expect(inherited).not.toBeNull();
  expect(customer).not.toBeNull();
  expect(drive).not.toBeNull();
  if (!inherited || !customer || !drive) {
    throw new Error("Apartment layout headings are missing");
  }
  expect(inherited.x).toBeLessThan(customer.x);
  expect(customer.y).toBeLessThan(drive.y);
  expect(inherited.y).toBeLessThan(drive.y);
};
