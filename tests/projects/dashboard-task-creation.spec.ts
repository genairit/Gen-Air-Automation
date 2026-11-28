import { seedMultiRoleUser } from "../../src/api/multi-role.ts";
import { createBoardPage } from "../../src/pages/board.page.ts";
import { ROUTES } from "../../src/constants/routes.constant.ts";
import { test, expect } from "../../src/fixtures/test.fixture.ts";
import { USER_ROLES } from "../../src/constants/user-role.constant.ts";
import { createRoleMenu } from "../../src/pages/role-menu.component.ts";
import { TEST_USERS } from "../../src/constants/test-users.constant.ts";
import { USER_ROLE_LABELS } from "../../src/constants/user-role.constant.ts";
import { createProjectFormPage } from "../../src/pages/project-form.page.ts";
import { readBoundingBox, readHorizontalOverflow } from "../../src/pages/layout.component.ts";

const VIEWPORTS = {
  DESKTOP: { width: 1440, height: 1000 },
  MOBILE: { width: 390, height: 844 },
} as const;

for (const [name, viewport] of Object.entries(VIEWPORTS)) {
  test.describe(`${name} dashboard task creation`, () => {
    test.use({ viewport });

    test("board restores its shared top bar above project filters and creation", async ({
      page,
    }, testInfo) => {
      const boardPage = createBoardPage(page);
      const projectForm = createProjectFormPage(page);

      await boardPage.goto();

      await expect(boardPage.newTaskButton).toHaveCount(0);
      await expect(boardPage.newProjectButton).toBeEnabled();

      const main = page.getByRole("main");
      await expect(main.locator(":scope > section")).toHaveCount(1);
      await expect(main.locator("header")).toHaveCount(1);
      await expect(main.getByRole("heading")).toHaveCount(0);
      await expect(main.getByText("פרויקטים", { exact: true })).toHaveCount(0);
      await expect(
        main.locator("header").getByText("ניהול פרויקטים ומשימות", { exact: true }),
      ).toBeVisible();
      await expect(main.getByText(/^·\s*\d+\s+תוצאות$/)).toHaveCount(0);
      await expect(main.getByRole("tablist")).toHaveCount(0);
      await expect(main.getByText("בניינים ופרויקטים עצמאיים בלבד", { exact: false })).toHaveCount(
        0,
      );
      const account = main.locator("header").getByRole("button", {
        name: new RegExp(TEST_USERS[USER_ROLES.SYSTEM_ADMIN].firstName),
      });
      await expect(account).toBeVisible();
      await expect(
        boardPage.card.getByRole("button", {
          name: new RegExp(TEST_USERS[USER_ROLES.SYSTEM_ADMIN].firstName),
        }),
      ).toHaveCount(0);
      const header = await readBoundingBox(main.locator("header"));
      const table = await readBoundingBox(boardPage.card);
      expect(header.y + header.height).toBeLessThanOrEqual(table.y);
      const search = await readBoundingBox(boardPage.searchBox);
      const project = await readBoundingBox(boardPage.newProjectButton);

      expect(await readHorizontalOverflow(page)).toBe(0);
      if (viewport.width === VIEWPORTS.DESKTOP.width) {
        const type = await readBoundingBox(boardPage.typeFilter);
        const status = await readBoundingBox(boardPage.statusFilter);
        expect(search.x).toBeGreaterThan(type.x);
        expect(type.x).toBeGreaterThan(status.x);
        expect(status.x).toBeGreaterThan(project.x);
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

    test("the restored top bar switches roles and updates project creation permissions", async ({
      api,
      openPageAs,
    }) => {
      const user = await seedMultiRoleUser(api, [USER_ROLES.SYSTEM_ADMIN, USER_ROLES.ENGINEER]);
      const actor = await openPageAs(user);
      await actor.setViewportSize(viewport);
      await actor.goto(ROUTES.BOARD);
      const board = createBoardPage(actor);
      const header = actor.locator("main > header");
      const roleMenu = createRoleMenu(actor);
      await expect(header).toHaveCount(1);
      await expect(header.locator('button[aria-haspopup="menu"]')).toHaveCount(1);
      await expect(board.newProjectButton).toBeVisible();
      await roleMenu.select(USER_ROLES.ENGINEER);
      await expect(roleMenu.trigger).toContainText(USER_ROLE_LABELS[USER_ROLES.ENGINEER]);
      await expect(board.newProjectButton).toHaveCount(0);
      await actor.reload();
      await expect(header).toHaveCount(1);
      await expect(roleMenu.trigger).toContainText(USER_ROLE_LABELS[USER_ROLES.ENGINEER]);
      await roleMenu.select(USER_ROLES.SYSTEM_ADMIN);
      await expect(board.newProjectButton).toBeVisible();
      expect(await readHorizontalOverflow(actor)).toBe(0);
    });
  });
}
