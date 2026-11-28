import { createBoardPage } from "../../src/pages/board.page.ts";
import { ROUTES } from "../../src/constants/routes.constant.ts";
import { test, expect } from "../../src/fixtures/test.fixture.ts";
import { createProjectFormPage } from "../../src/pages/project-form.page.ts";
import { readBoundingBox, readHorizontalOverflow } from "../../src/pages/layout.component.ts";

const VIEWPORTS = {
  DESKTOP: { width: 1440, height: 1000 },
  MOBILE: { width: 390, height: 844 },
} as const;

for (const [name, viewport] of Object.entries(VIEWPORTS)) {
  test.describe(`${name} dashboard task creation`, () => {
    test.use({ viewport });

    test("board offers project creation after its filters and omits task creation", async ({
      page,
    }, testInfo) => {
      const boardPage = createBoardPage(page);
      const projectForm = createProjectFormPage(page);

      await boardPage.goto();

      await expect(boardPage.newTaskButton).toHaveCount(0);
      await expect(boardPage.newProjectButton).toBeEnabled();

      const search = await readBoundingBox(boardPage.searchBox);
      const project = await readBoundingBox(boardPage.newProjectButton);

      expect(project.y).toBeGreaterThanOrEqual(search.y + search.height);
      expect(await readHorizontalOverflow(page)).toBe(0);

      await page.screenshot({ path: testInfo.outputPath("dashboard-actions.png"), fullPage: true });
      await boardPage.newProjectButton.click();

      await expect(projectForm.createButton).toBeVisible();
      await expect(page).toHaveURL(ROUTES.NEW_PROJECT);
    });
  });
}
