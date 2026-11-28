import type { Locator } from "@playwright/test";
import { createBoardPage } from "../../src/pages/board.page.ts";
import { test, expect } from "../../src/fixtures/test.fixture.ts";
import { PROJECT_TYPE_NAMES } from "../../src/constants/domain.constant.ts";
import { AUTOMATION_DIRECTORIES } from "../../src/constants/environment.constant.ts";

const BLUE_HIGHLIGHT = "rgba(22, 104, 189, 0.25)";
const RESTING_SURFACE = "rgba(255, 255, 255, 0.4)";

const readBackground = (element: Locator) =>
  element.evaluate(option => getComputedStyle(option).backgroundColor);

test("project type options have uniform labels and the blue highlight follows the pointer", async ({
  page,
}) => {
  const board = createBoardPage(page);

  await board.goto();
  await board.typeFilter.click();

  const privateClient = page.getByRole("option", {
    name: PROJECT_TYPE_NAMES.PRIVATE_CLIENT,
    exact: true,
  });
  const commercial = page.getByRole("option", {
    name: PROJECT_TYPE_NAMES.COMMERCIAL,
    exact: true,
  });

  await expect(privateClient).toHaveText(PROJECT_TYPE_NAMES.PRIVATE_CLIENT);
  await expect(commercial).toHaveText(PROJECT_TYPE_NAMES.COMMERCIAL);

  await privateClient.hover();
  await expect.poll(() => readBackground(privateClient)).toBe(BLUE_HIGHLIGHT);
  await expect.poll(() => readBackground(commercial)).toBe(RESTING_SURFACE);

  await commercial.hover();
  await expect.poll(() => readBackground(commercial)).toBe(BLUE_HIGHLIGHT);
  await expect.poll(() => readBackground(privateClient)).toBe(RESTING_SURFACE);

  await page.mouse.move(0, 0);
  await expect.poll(() => readBackground(commercial)).toBe(BLUE_HIGHLIGHT);

  await page.screenshot({ path: `${AUTOMATION_DIRECTORIES.RESULTS}/project-type-hover.png` });

  const filter = board.typeFilter;
  await filter.press("ArrowDown");
  await expect.poll(() => readBackground(privateClient)).toBe(BLUE_HIGHLIGHT);
  await filter.press("Enter");
  await expect(filter).toHaveValue(PROJECT_TYPE_NAMES.PRIVATE_CLIENT);
});
