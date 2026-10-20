import {
  MOCK_DRIVE_FILE,
  mockDriveUpload,
  mockDriveContents,
  MOCK_DRIVE_FOLDERS,
} from "../../src/mocks/drive.mock.ts";

import {
  ROOT_FOLDER_ID,
  mockMissingDrive,
  MOCK_NESTED_FOLDER,
} from "../../src/mocks/drive.mock.ts";

import type { Page } from "@playwright/test";
import type { TGenAirApi } from "../../src/api/gen-air-api.ts";
import { API_PATHS } from "../../src/constants/api.constant.ts";
import { test, expect } from "../../src/fixtures/test.fixture.ts";
import { MIME_TYPES } from "../../src/constants/domain.constant.ts";
import { createProjectPage } from "../../src/pages/project.page.ts";
import { createApartmentPage } from "../../src/pages/apartment.page.ts";
import { seedBuilding, seedApartment } from "../../src/api/seed-data.ts";
import { ROLE_ACCESS } from "../../src/constants/role-access.constant.ts";
import { USER_ROLE_VALUES } from "../../src/constants/user-role.constant.ts";
import { getAuthStatePath } from "../../src/utilities/auth-state.utility.ts";
import { HTTP_STATUS, HTTP_METHODS } from "../../src/constants/http.constant.ts";
import { seedCustomer, seedStandaloneProject } from "../../src/api/seed-data.ts";
import { DRIVE_COPY, PROJECT_PAGE_COPY } from "../../src/constants/copy.constant.ts";

const VALID_PDF = {
  name: "הצעת מחיר.pdf",
  mimeType: MIME_TYPES.PDF,
  buffer: Buffer.from("%PDF-1.4\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF\n"),
};

const BLOCKED_FILE = {
  name: "installer.exe",
  buffer: Buffer.from("MZ binary"),
  mimeType: MIME_TYPES.BINARY,
};

test("the Drive-unavailable banner shows when Drive is not configured", async ({ page, api }) => {
  const project = await seedStandaloneProject(api, await seedCustomer(api));
  const projectPage = createProjectPage(page);

  await projectPage.goto(project.id);

  await expect(
    page.getByRole("status").filter({ hasText: DRIVE_COPY.UNAVAILABLE_TITLE }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: DRIVE_COPY.RETRY })).toBeVisible();
});

test("project folders show their empty or non-empty status and list their files", async ({
  page,
  api,
}) => {
  const project = await seedStandaloneProject(api, await seedCustomer(api));
  const projectPage = createProjectPage(page);
  const folderWithFiles = projectPage.driveFolder(MOCK_DRIVE_FOLDERS.WITH_FILES.name);
  const emptyFolder = projectPage.driveFolder(MOCK_DRIVE_FOLDERS.EMPTY.name);

  await mockDriveContents(page, project.id);
  await projectPage.goto(project.id);

  await expect(page.getByText(PROJECT_PAGE_COPY.FOLDERS_TITLE)).toBeVisible();
  await expect(
    folderWithFiles.getByRole("img", { name: DRIVE_COPY.FOLDER_HAS_FILES }),
  ).toBeVisible();
  await expect(emptyFolder.getByRole("img", { name: DRIVE_COPY.EMPTY_FOLDER })).toBeVisible();

  await folderWithFiles.click();

  await expect(page.getByText(MOCK_DRIVE_FILE.name)).toBeVisible();
});

test("upload a supported file to the project Drive", async ({ page, api }) => {
  const project = await seedStandaloneProject(api, await seedCustomer(api));
  const projectPage = createProjectPage(page);

  await mockDriveContents(page, project.id);

  const uploads = await mockDriveUpload(page, project.id);

  await projectPage.goto(project.id);
  await projectPage.uploadInput.setInputFiles(VALID_PDF);

  await expect.poll(() => uploads.some(body => body.includes(VALID_PDF.name))).toBe(true);
});

test("a file that breaks the upload policy is rejected before upload", async ({ page, api }) => {
  const project = await seedStandaloneProject(api, await seedCustomer(api));
  const projectPage = createProjectPage(page);

  await mockDriveContents(page, project.id);

  const uploads = await mockDriveUpload(page, project.id);

  await projectPage.goto(project.id);
  await projectPage.uploadInput.setInputFiles(BLOCKED_FILE);

  await expect(page.getByText(DRIVE_COPY.UNSUPPORTED_FILE)).toBeVisible();
  expect(uploads).toHaveLength(0);
});

const DRIVE_SCENARIOS = {
  standalone: async (page: Page, api: TGenAirApi) => {
    const project = await seedStandaloneProject(api, await seedCustomer(api));
    return { project, hasUploads: true, open: () => createProjectPage(page).goto(project.id) };
  },
  building: async (page: Page, api: TGenAirApi) => {
    const project = await seedBuilding(api, await seedCustomer(api));
    return { project, hasUploads: true, open: () => createProjectPage(page).goto(project.id) };
  },
  apartment: async (page: Page, api: TGenAirApi) => {
    const building = await seedBuilding(api, await seedCustomer(api));
    const project = await seedApartment(api, building);
    return {
      project,
      hasUploads: false,
      open: () => createApartmentPage(page).goto(building.id, project.id),
    };
  },
} as const;

for (const [kind, createScenario] of Object.entries(DRIVE_SCENARIOS)) {
  for (const viewport of [
    { width: 1440, height: 1000 },
    { width: 390, height: 844 },
  ]) {
    test(`${kind} Drive card follows the header at ${viewport.width}px with nested folders and safe links`, async ({
      page,
      api,
    }, testInfo) => {
      await page.setViewportSize(viewport);
      const scenario = await createScenario(page, api);
      const projectPage = createProjectPage(page);
      await mockDriveContents(page, scenario.project.id);
      await scenario.open();
      const card = projectPage.driveCard;
      await expect(card).toHaveCount(1);
      await expect(card.getByText(DRIVE_COPY.SUBTITLE)).toBeVisible();
      await expect(card.getByText(DRIVE_COPY.FOLDER_HAS_FILES, { exact: true })).toBeVisible();
      for (const color of ["#0F9D58", "#FFC107", "#4285F4"]) {
        await expect(card.locator(`svg path[fill="${color}"]`)).toBeVisible();
      }
      await expect(card.getByRole("link", { name: DRIVE_COPY.OPEN_FOLDER })).toHaveAttribute(
        "href",
        `https://drive.google.com/drive/folders/${ROOT_FOLDER_ID}`,
      );
      await expect(card.getByRole("link", { name: DRIVE_COPY.OPEN_FOLDER })).toHaveAttribute(
        "target",
        "_blank",
      );
      const placement = await card.evaluate(element => ({
        index: Array.from(element.parentElement?.children ?? []).indexOf(element),
        width: element.getBoundingClientRect().width,
        headerWidth: element.previousElementSibling?.getBoundingClientRect().width ?? 0,
      }));
      expect(placement.index).toBe(1);
      expect(Math.abs(placement.width - placement.headerWidth)).toBeLessThan(2);
      const fullFolder = projectPage.driveFolder(MOCK_DRIVE_FOLDERS.WITH_FILES.name);
      await expect(
        fullFolder.getByRole("img", { name: DRIVE_COPY.FOLDER_HAS_FILES }),
      ).toBeVisible();
      await expect(
        projectPage
          .driveFolder(MOCK_DRIVE_FOLDERS.EMPTY.name)
          .getByRole("img", { name: DRIVE_COPY.EMPTY_FOLDER }),
      ).toBeVisible();
      await fullFolder.click();
      await expect(fullFolder).toHaveAttribute("aria-expanded", "true");
      const nestedFolder = projectPage.driveFolder(MOCK_NESTED_FOLDER.name);
      await expect(
        nestedFolder.getByRole("img", { name: DRIVE_COPY.FOLDER_HAS_FILES }),
      ).toBeVisible();
      await nestedFolder.click();
      const fileLinks = card.getByRole("link", { name: MOCK_DRIVE_FILE.name, exact: true });
      await expect(fileLinks).toHaveCount(2);
      for (const link of await fileLinks.all()) {
        await expect(link).toHaveAttribute("href", MOCK_DRIVE_FILE.webViewLink);
        await expect(link).toHaveAttribute("target", "_blank");
        await expect(link).toHaveAttribute("rel", "noopener noreferrer");
      }
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
      ).toBe(true);
      await page.screenshot({
        path: testInfo.outputPath(`${kind}-${viewport.width}.png`),
        fullPage: true,
      });
      if (scenario.hasUploads) {
        await expect(projectPage.uploadInput).toHaveCount(1);
        await expect(page.getByText(PROJECT_PAGE_COPY.TIMELINE_TITLE)).toBeVisible();
      }
    });
  }
}

for (const role of USER_ROLE_VALUES) {
  test.describe(`${role} Drive recovery`, () => {
    test.use({ storageState: getAuthStatePath(role) });
    test("missing root is friendly and recovery is limited to project editors", async ({
      page,
      api,
    }) => {
      const project = await seedStandaloneProject(api, await seedCustomer(api));
      const missing = await mockMissingDrive(page, project);
      const projectPage = createProjectPage(page);
      await projectPage.goto(project.id);
      await expect(projectPage.driveCard.getByText(DRIVE_COPY.MISSING_TITLE)).toBeVisible();
      await expect(projectPage.driveCard).not.toContainText(project.id);
      expect(missing.requests.provisions).toHaveLength(0);
      const button = projectPage.driveCard.getByRole("button", { name: DRIVE_COPY.PREPARE_FOLDER });
      if (!ROLE_ACCESS[role].canEditProject) {
        await expect(button).toHaveCount(0);
        await expect(projectPage.driveCard.getByText(DRIVE_COPY.READ_ONLY)).toBeVisible();
        return;
      }
      const pending = { resolve: () => {} };
      const responseReady = new Promise<void>(resolve => {
        pending.resolve = resolve;
      });
      await page.route(missing.provisionRoute, async route => {
        missing.requests.provisions.push(route.request().method());
        await responseReady;
        missing.state.recovered = true;
        await route.fulfill({
          status: HTTP_STATUS.CREATED,
          json: { ...project, driveFolderId: ROOT_FOLDER_ID },
        });
      });
      const projectRefresh = page.waitForResponse(response =>
        response.url().endsWith(`${API_PATHS.PROJECT}/${project.id}`),
      );
      await button.click();
      await expect(
        projectPage.driveCard.getByRole("button", { name: DRIVE_COPY.PREPARING_FOLDER }),
      ).toBeDisabled();
      expect(missing.requests.provisions).toEqual([HTTP_METHODS.POST]);
      pending.resolve();
      await projectRefresh;
      await expect(projectPage.driveCard.getByText(DRIVE_COPY.MISSING_TITLE)).toHaveCount(0);
      await expect(
        projectPage.driveCard.getByRole("link", { name: DRIVE_COPY.OPEN_FOLDER }),
      ).toBeVisible();
      expect(missing.requests.contents).toBeGreaterThan(1);
      expect(missing.requests.provisions).toEqual([HTTP_METHODS.POST]);
    });
  });
}

for (const failure of [
  {
    status: HTTP_STATUS.SERVICE_UNAVAILABLE,
    code: "DRIVE_AUTHENTICATION_FAILED",
    message: DRIVE_COPY.AUTHENTICATION_FAILED,
  },
  {
    status: HTTP_STATUS.INTERNAL_SERVER_ERROR,
    code: "INTERNAL_ERROR",
    message: DRIVE_COPY.PROVISION_FAILED,
  },
]) {
  test(`recovery failure ${failure.status} is friendly and can be retried`, async ({
    page,
    api,
  }) => {
    const project = await seedStandaloneProject(api, await seedCustomer(api));
    const missing = await mockMissingDrive(page, project);
    await page.route(missing.provisionRoute, route =>
      route.fulfill({
        status: failure.status,
        json: { code: failure.code, message: `GaxiosError invalid_grant ${project.id}` },
      }),
    );
    const projectPage = createProjectPage(page);
    await projectPage.goto(project.id);
    const button = projectPage.driveCard.getByRole("button", { name: DRIVE_COPY.PREPARE_FOLDER });
    await button.click();
    await expect(projectPage.driveCard.getByText(failure.message)).toBeVisible();
    await expect(projectPage.driveCard).not.toContainText("GaxiosError");
    await expect(projectPage.driveCard).not.toContainText(project.id);
    await expect(button).toBeEnabled();
    await page.route(missing.provisionRoute, async route => {
      missing.state.recovered = true;
      await route.fulfill({
        status: HTTP_STATUS.CREATED,
        json: { ...project, driveFolderId: ROOT_FOLDER_ID },
      });
    });
    await button.click();
    await expect(
      projectPage.driveCard.getByRole("link", { name: DRIVE_COPY.OPEN_FOLDER }),
    ).toBeVisible();
    await expect(projectPage.driveCard.getByText(failure.message)).toHaveCount(0);
  });
}
