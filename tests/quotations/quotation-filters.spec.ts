import { ROUTES } from "../../src/constants/routes.constant.ts";
import { test, expect } from "../../src/fixtures/test.fixture.ts";

test("old quotation list bookmarks return to the board without a desktop or mobile quotation menu", async ({
  page,
}) => {
  await page.goto(`${ROUTES.QUOTATIONS}?status=draft`);
  await expect(page).toHaveURL(ROUTES.BOARD);
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 900 });
    const navigation = page
      .getByRole("navigation")
      .filter({ has: page.getByRole("button", { name: "תיקים", exact: true }) });
    await expect(navigation).toBeVisible();
    await expect(navigation.getByText("הצעות מחיר", { exact: true })).toHaveCount(0);
  }
  await expect(page.getByRole("group", { name: "סינון הצעות מחיר" })).toHaveCount(0);
});
