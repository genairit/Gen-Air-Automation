import type { Locator } from "@playwright/test";
import { ROUTES } from "../../src/constants/routes.constant.ts";
import { test, expect } from "../../src/fixtures/test.fixture.ts";
import { ROLE_ACCESS } from "../../src/constants/role-access.constant.ts";
import { getAuthStatePath } from "../../src/utilities/auth-state.utility.ts";
import { USER_ROLES, USER_ROLE_VALUES } from "../../src/constants/user-role.constant.ts";
import { BOARD_COPY, TASKS_COPY, EMPLOYEES_COPY } from "../../src/constants/copy.constant.ts";
import { createCustomersPage, createCustomerFormPage } from "../../src/pages/customers.page.ts";

const CUSTOMER_CREATION_DENIED_ROLES = USER_ROLE_VALUES.filter(
  role => !ROLE_ACCESS[role].canManageCustomers,
);

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
      const customersPage = createCustomersPage(page);

      await customersPage.goto();

      await expect(customersPage.heading).toBeVisible();
      await expectVisibility(access.canManageCustomers, customersPage.newCustomerButton);
      await expectVisibility(!access.canManageCustomers, customersPage.managersOnlyCaption);
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
});

for (const role of CUSTOMER_CREATION_DENIED_ROLES) {
  test.describe(`${role} opening the new-customer form`, () => {
    test.use({ storageState: getAuthStatePath(role) });

    test("sees a permission denial that leads back to the customers list", async ({ page }) => {
      const formPage = createCustomerFormPage(page);

      await formPage.goto();

      await expect(formPage.deniedTitle).toBeVisible();
      await expect(formPage.saveButton).toHaveCount(0);

      await formPage.backToCustomersButton.click();

      await expect(page).toHaveURL(ROUTES.CUSTOMERS);
    });
  });
}
