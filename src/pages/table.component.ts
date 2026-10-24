import { expect, type Page, type Locator } from "@playwright/test";

const HEADER_ROW_COUNT = 1;

export const findTableRow = (scope: Page | Locator, text: string): Locator =>
  scope.getByRole("row").filter({ hasText: text });

export const expectResultRowCount = (page: Page, count: number): Promise<void> =>
  expect(page.getByRole("row")).toHaveCount(HEADER_ROW_COUNT + count);

export const expectSingleResultRow = (page: Page): Promise<void> => expectResultRowCount(page, 1);
