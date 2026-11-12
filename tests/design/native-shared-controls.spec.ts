import { test, expect } from "../../src/fixtures/test.fixture.ts";
import { findFieldContainer } from "../../src/pages/field.component.ts";

test("shared free-text input accepts keyboard entry and keeps a committed chip", async ({
  page,
}) => {
  await page.goto("/components");
  const input = findFieldContainer(page, "תיאור חופשי").getByRole("textbox");
  await expect(input).toBeVisible();
  await input.fill("תיאור בדיקה");
  await input.press("Enter");
  await expect(input).toHaveValue("");
  const freeTextCard = page
    .getByText("FreeTextInput", { exact: true })
    .locator("xpath=ancestor::section[1]");
  await expect(freeTextCard.getByText("תיאור", { exact: true })).toBeVisible();
  await expect(freeTextCard.getByText("בדיקה", { exact: true })).toBeVisible();
  await expect(input).toBeFocused();
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(input).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: test.info().outputPath("free-text-mobile.png"), fullPage: true });
});
