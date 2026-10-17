import {
  BOARD_COPY,
  TASKS_COPY,
  CUSTOMERS_COPY,
  EMPLOYEES_COPY,
} from "../../src/constants/copy.constant.ts";

import type { Locator } from "@playwright/test";
import { ROUTES } from "../../src/constants/routes.constant.ts";
import { test, expect } from "../../src/fixtures/test.fixture.ts";
import { ROLE_ACCESS } from "../../src/constants/role-access.constant.ts";
import { getAuthStatePath } from "../../src/utilities/auth-state.utility.ts";
import { USER_ROLES, USER_ROLE_VALUES } from "../../src/constants/user-role.constant.ts";

const expectVisibility = async (isVisible: boolean, locator: Locator) => {
  if (isVisible) {
    await expect(locator).toBeVisible();

    return;
  }

  await expect(locator).toHaveCount(0);
};

for (const role of USER_ROLE_VALUES) {
  const access = ROLE_ACCESS[role];

  test.describe(`${role} access`, () => {
    test.use({ storageState: getAuthStatePath(role) });

    test("board shows project creation only when allowed", async ({ page }) => {
      await page.goto(ROUTES.BOARD);

      await expectVisibility(
        access.canCreateProject,
        page.getByRole("button", { name: BOARD_COPY.NEW_PROJECT }),
      );
    });

    test("customers page shows customer creation only when allowed", async ({ page }) => {
      await page.goto(ROUTES.CUSTOMERS);

      await expectVisibility(
        access.canManageCustomers,
        page.getByRole("button", { name: CUSTOMERS_COPY.NEW_CUSTOMER }),
      );
    });

    test("tasks page shows task creation only when allowed", async ({ page }) => {
      await page.goto(ROUTES.TASKS);

      await expectVisibility(
        access.canManageTasks,
        page.getByRole("button", { name: TASKS_COPY.NEW_TASK }),
      );
    });

    test("employees page shows the add-employee form only when allowed", async ({ page }) => {
      await page.goto(ROUTES.EMPLOYEES);

      await expectVisibility(
        access.canManageUsers,
        page.getByRole("button", { name: EMPLOYEES_COPY.ADD_EMPLOYEE }),
      );
    });
  });
}

test.describe("restricted routes", () => {
  test.use({ storageState: getAuthStatePath(USER_ROLES.LEAD_INSTALLER) });

  test("an installer opening the new-task form sees a permission denial", async ({ page }) => {
    await page.goto(ROUTES.NEW_TASK);

    await expect(page.getByText(TASKS_COPY.CREATE_DENIED)).toBeVisible();
  });

  test("an installer opening the new-customer form sees a permission denial", async ({ page }) => {
    await page.goto(ROUTES.NEW_CUSTOMER);

    await expect(page.getByText(CUSTOMERS_COPY.CREATE_DENIED)).toBeVisible();
  });
});
