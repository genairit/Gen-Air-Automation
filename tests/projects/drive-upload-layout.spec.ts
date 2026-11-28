import {
  seedCustomer,
  seedBuilding,
  seedApartment,
  seedStandaloneProject,
} from "../../src/api/seed-data.ts";

import { test, expect } from "../../src/fixtures/test.fixture.ts";
import { createProjectPage } from "../../src/pages/project.page.ts";
import { mockDriveManagement } from "../../src/mocks/drive-management.mock.ts";
import { openWorkspaceTab } from "../../src/pages/project-workspace.component.ts";
import { buildApartmentRoute, buildProjectRoute } from "../../src/utilities/route.utility.ts";

for (const kind of ["standalone", "building", "apartment"] as const) {
  for (const width of [1280, 390]) {
    test(`${kind} opens compact upload from the files toolbar at ${width}px`, async ({
      page,
      api,
    }, info) => {
      await page.setViewportSize({ width, height: 800 });
      const customer = await seedCustomer(api);
      const parent =
        kind === "standalone"
          ? await seedStandaloneProject(api, customer)
          : await seedBuilding(api, customer);
      const project = kind === "apartment" ? await seedApartment(api, parent) : parent;
      await mockDriveManagement(page, project.id);
      await page.goto(
        kind === "apartment"
          ? buildApartmentRoute(parent.id, project.id)
          : buildProjectRoute(project.id),
      );
      await openWorkspaceTab(page, "files");
      await expect(page.locator("input[type=file]")).toHaveCount(0);
      const upload = page.getByRole("button", { name: "העלאת קבצים", exact: true });
      await expect(upload).toBeVisible();
      if (width === 1280)
        expect(
          await page.evaluate(() => document.documentElement.scrollHeight - innerHeight),
        ).toBeLessThanOrEqual(1);
      await upload.click();
      const dialog = page.getByRole("dialog", { name: "העלאת קבצים", exact: true });
      await expect(dialog.getByText("גרור ושחרר קבצים לכאן להעלאה", { exact: true })).toBeVisible();
      await expect(
        dialog.getByRole("button", { name: "בחר קבצים מהמחשב", exact: true }),
      ).toBeEnabled();
      await expect(dialog.locator("input[type=file]")).toHaveCount(1);
      await expect(dialog.getByRole("button", { name: "בחר תיקייה", exact: true })).toBeEnabled();
      expect(await dialog.evaluate(el => el.scrollWidth <= el.clientWidth + 1)).toBe(true);
      await dialog.screenshot({ path: info.outputPath(`upload-${kind}-${width}.png`) });
      await dialog.getByRole("button", { name: "סיום", exact: true }).click();
      await openWorkspaceTab(page, "history");
      await expect(createProjectPage(page).driveCard).toBeHidden();
    });
  }
}
