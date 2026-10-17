import {
  MOCK_DRIVE_FILE,
  mockDriveUpload,
  mockDriveContents,
  MOCK_DRIVE_FOLDERS,
} from "../../src/mocks/drive.mock.ts";

import { test, expect } from "../../src/fixtures/test.fixture.ts";
import { MIME_TYPES } from "../../src/constants/domain.constant.ts";
import { createProjectPage } from "../../src/pages/project.page.ts";
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
