import { createBoardPage } from "../../src/pages/board.page.ts";
import { ROUTES } from "../../src/constants/routes.constant.ts";
import { TASKS_COPY } from "../../src/constants/copy.constant.ts";
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

    test("creation actions follow filters, remain visible and open their forms", async ({
      page,
    }, testInfo) => {
      const boardPage = createBoardPage(page);
      const projectForm = createProjectFormPage(page);

      await boardPage.goto();

      await expect(boardPage.newTaskButton).toBeEnabled();
      await expect(boardPage.newProjectButton).toBeEnabled();

      const search = await readBoundingBox(boardPage.searchBox);
      const task = await readBoundingBox(boardPage.newTaskButton);
      const project = await readBoundingBox(boardPage.newProjectButton);

      expect(task.y).toBeGreaterThanOrEqual(search.y + search.height);
      expect(project.y).toBeGreaterThanOrEqual(search.y + search.height);
      expect(await readHorizontalOverflow(page)).toBe(0);

      if (viewport.width === VIEWPORTS.DESKTOP.width) {
        expect(task.y).toBe(project.y);
        expect(task.x).toBeGreaterThan(project.x);
      }

      await page.screenshot({ path: testInfo.outputPath("dashboard-actions.png"), fullPage: true });
      await boardPage.newTaskButton.click();

      await expect(page).toHaveURL(ROUTES.NEW_TASK);
      await expect(
        page.getByRole("heading", { name: TASKS_COPY.NEW_TASK, exact: true }),
      ).toBeVisible();

      await boardPage.goto();
      await boardPage.newProjectButton.click();

      await expect(projectForm.createButton).toBeVisible();
      await expect(page).toHaveURL(ROUTES.NEW_PROJECT);
    });
  });
}
