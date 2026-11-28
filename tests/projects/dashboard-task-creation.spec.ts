import { createBoardPage } from "../../src/pages/board.page.ts";
import { ROUTES } from "../../src/constants/routes.constant.ts";
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

    test("board offers project creation after its filters and omits task creation", async ({
      page,
    }, testInfo) => {
      const boardPage = createBoardPage(page);
      const projectForm = createProjectFormPage(page);

      await boardPage.goto();

      await expect(boardPage.newTaskButton).toHaveCount(0);
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
      const project = await readBoundingBox(boardPage.newProjectButton);

      expect(await readHorizontalOverflow(page)).toBe(0);
      if (viewport.width === VIEWPORTS.DESKTOP.width) {
        const type = await readBoundingBox(boardPage.typeFilter);
        const status = await readBoundingBox(boardPage.statusFilter);
        const person = await readBoundingBox(account);
        expect(search.x).toBeGreaterThan(type.x);
        expect(type.x).toBeGreaterThan(status.x);
        expect(status.x).toBeGreaterThan(project.x);
        expect(project.x).toBeGreaterThan(person.x);
        expect(
          Math.abs(search.y + search.height / 2 - (project.y + project.height / 2)),
        ).toBeLessThan(2);
      } else {
        expect(project.y).toBeGreaterThanOrEqual(search.y + search.height);
      }

      await page.screenshot({ path: testInfo.outputPath("dashboard-actions.png"), fullPage: true });
      await boardPage.newProjectButton.click();

      await expect(projectForm.createButton).toBeVisible();
      await expect(page).toHaveURL(ROUTES.NEW_PROJECT);
      await expect(
        main.locator("header").getByRole("button", {
          name: new RegExp(TEST_USERS[USER_ROLES.SYSTEM_ADMIN].firstName),
        }),
      ).toBeVisible();
    });
  });
}
