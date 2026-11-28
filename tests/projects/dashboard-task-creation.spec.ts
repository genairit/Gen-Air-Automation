import { createBoardPage } from "../../src/pages/board.page.ts";
import { ROUTES } from "../../src/constants/routes.constant.ts";
import { TASKS_COPY } from "../../src/constants/copy.constant.ts";
import { test, expect } from "../../src/fixtures/test.fixture.ts";
import { USER_ROLES } from "../../src/constants/user-role.constant.ts";
import { TEST_USERS } from "../../src/constants/test-users.constant.ts";
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

      const main = page.getByRole("main");
      await expect(main.locator(":scope > section")).toHaveCount(1);
      await expect(main.locator("header")).toHaveCount(0);
      await expect(main.getByRole("heading")).toHaveCount(0);
      await expect(main.getByText("פרויקטים", { exact: true })).toHaveCount(0);
      await expect(main.getByText("ניהול פרויקטים ומשימות", { exact: true })).toHaveCount(0);
      await expect(main.getByText(/^·\s*\d+\s+תוצאות$/)).toHaveCount(0);
      await expect(main.getByRole("tablist")).toHaveCount(0);
      await expect(main.getByText("בניינים ופרויקטים עצמאיים בלבד", { exact: false })).toHaveCount(
        0,
      );
      const account = boardPage.card.getByRole("button", {
        name: new RegExp(TEST_USERS[USER_ROLES.SYSTEM_ADMIN].firstName),
      });
      await expect(account).toBeVisible();
      const search = await readBoundingBox(boardPage.searchBox);
      const task = await readBoundingBox(boardPage.newTaskButton);
      const project = await readBoundingBox(boardPage.newProjectButton);

      expect(await readHorizontalOverflow(page)).toBe(0);

      if (viewport.width === VIEWPORTS.DESKTOP.width) {
        const type = await readBoundingBox(boardPage.typeFilter);
        const status = await readBoundingBox(boardPage.statusFilter);
        const person = await readBoundingBox(account);
        expect(search.x).toBeGreaterThan(type.x);
        expect(type.x).toBeGreaterThan(status.x);
        expect(status.x).toBeGreaterThan(task.x);
        expect(project.x).toBeGreaterThan(person.x);
        expect(Math.abs(search.y + search.height / 2 - (task.y + task.height / 2))).toBeLessThan(2);
        expect(task.y).toBe(project.y);
        expect(task.x).toBeGreaterThan(project.x);
      } else {
        expect(task.y).toBeGreaterThanOrEqual(search.y + search.height);
        expect(project.y).toBeGreaterThanOrEqual(search.y + search.height);
      }

      await page.screenshot({ path: testInfo.outputPath("dashboard-actions.png"), fullPage: true });
      await boardPage.newTaskButton.click();

      await expect(page).toHaveURL(ROUTES.NEW_TASK);
      await expect(
        main.locator("header").getByRole("button", {
          name: new RegExp(TEST_USERS[USER_ROLES.SYSTEM_ADMIN].firstName),
        }),
      ).toBeVisible();
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
