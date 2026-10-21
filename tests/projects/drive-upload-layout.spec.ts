import {
  seedCustomer,
  seedBuilding,
  seedApartment,
  seedStandaloneProject,
} from "../../src/api/seed-data.ts";

import { test, expect } from "../../src/fixtures/test.fixture.ts";
import { createApartmentPage } from "../../src/pages/apartment.page.ts";
import { PROJECT_PAGE_COPY } from "../../src/constants/copy.constant.ts";
import { mockDriveManagement } from "../../src/mocks/drive-management.mock.ts";
import { createDriveManagement } from "../../src/pages/drive-management.component.ts";
import { MANAGEMENT_FOLDERS as FOLDERS } from "../../src/mocks/drive-management.mock.ts";
import { DRIVE_MANAGEMENT_COPY as COPY } from "../../src/constants/drive-management.constant.ts";

const UPLOAD_COPY = {
  TITLE: "גרור ושחרר קבצים לכאן להעלאה",
  BUTTON: "בחר קבצים מהמחשב",
} as const;

for (const kind of ["standalone", "building", "apartment"] as const) {
  for (const width of [1440, 390]) {
    test(`${kind} upload is inside Drive card directly after folders with responsive layout at ${width}px`, async ({
      page,
      api,
    }, testInfo) => {
      await page.setViewportSize({ width, height: 1000 });
      const customer = await seedCustomer(api);
      const parent =
        kind === "standalone"
          ? await seedStandaloneProject(api, customer)
          : await seedBuilding(api, customer);
      const project = kind === "apartment" ? await seedApartment(api, parent) : parent;
      await mockDriveManagement(page, project.id);
      const ui = createDriveManagement(page);
      await (kind === "apartment"
        ? createApartmentPage(page).goto(parent.id, project.id)
        : ui.goto(project.id));

      const title = ui.driveCard.getByText(UPLOAD_COPY.TITLE, { exact: true });
      const zone = title.locator("..");
      const description = zone.locator(":scope > span");
      const icon = zone.locator(":scope > div").first();
      const button = ui.driveCard.getByRole("button", { name: UPLOAD_COPY.BUTTON, exact: true });
      const folder = ui.driveFolder(FOLDERS.TARGET.name);
      await expect(ui.driveCard.locator("input[type=file]")).toHaveCount(1);
      await expect(ui.uploadInput).toHaveCount(1);
      await expect(title).toBeVisible();
      await expect(button).toBeEnabled();
      await expect(
        ui.driveCard.getByRole("button", { name: COPY.CHOOSE, exact: true }),
      ).toBeEnabled();
      await expect(page.getByText(PROJECT_PAGE_COPY.TIMELINE_TITLE, { exact: true })).toBeVisible();
      await expect(ui.driveCard.getByText(PROJECT_PAGE_COPY.TIMELINE_TITLE)).toHaveCount(0);
      const folderBounds = await folder.boundingBox();
      const titleBounds = await title.boundingBox();
      const descriptionBounds = await description.boundingBox();
      const iconBounds = await icon.boundingBox();
      const buttonBounds = await button.boundingBox();
      const cardBounds = await ui.driveCard.boundingBox();
      const timelineBounds = await page
        .getByText(PROJECT_PAGE_COPY.TIMELINE_TITLE, { exact: true })
        .boundingBox();
      expect(folderBounds).not.toBeNull();
      expect(titleBounds).not.toBeNull();
      expect(descriptionBounds).not.toBeNull();
      expect(iconBounds).not.toBeNull();
      expect(buttonBounds).not.toBeNull();
      expect(cardBounds).not.toBeNull();
      expect(timelineBounds).not.toBeNull();
      if (
        !folderBounds ||
        !titleBounds ||
        !descriptionBounds ||
        !iconBounds ||
        !buttonBounds ||
        !cardBounds ||
        !timelineBounds
      ) {
        throw new Error("Expected visible project upload layout");
      }
      expect(titleBounds.y).toBeGreaterThanOrEqual(folderBounds.y + folderBounds.height);
      expect(timelineBounds.y).toBeGreaterThan(cardBounds.y + cardBounds.height);
      if (width > 1000) {
        expect(descriptionBounds.y).toBeGreaterThanOrEqual(titleBounds.y + titleBounds.height);
        expect(Math.abs(descriptionBounds.x - titleBounds.x)).toBeLessThanOrEqual(1);
        expect(iconBounds.x).toBeGreaterThanOrEqual(titleBounds.x + titleBounds.width);
        expect(iconBounds.x).toBeGreaterThanOrEqual(descriptionBounds.x + descriptionBounds.width);
        expect(buttonBounds.x + buttonBounds.width).toBeLessThanOrEqual(titleBounds.x);
        expect(buttonBounds.y).toBeLessThan(titleBounds.y + titleBounds.height);
        expect(buttonBounds.y + buttonBounds.height).toBeGreaterThan(titleBounds.y);
      } else {
        expect(buttonBounds.y).toBeGreaterThan(titleBounds.y + titleBounds.height);
      }
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      );
      await ui.driveCard.screenshot({
        path: testInfo.outputPath(`drive-upload-${kind}-${width}.png`),
      });
    });
  }
}
