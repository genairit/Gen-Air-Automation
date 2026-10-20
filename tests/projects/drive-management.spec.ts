import {
  seedCustomer,
  seedBuilding,
  seedApartment,
  seedStandaloneProject,
} from "../../src/api/seed-data.ts";

import {
  MANAGEMENT_FILE,
  mockDriveManagement,
  MANAGEMENT_FOLDERS as FOLDERS,
} from "../../src/mocks/drive-management.mock.ts";

import type { Page } from "@playwright/test";
import { test, expect } from "../../src/fixtures/test.fixture.ts";
import { MIME_TYPES } from "../../src/constants/domain.constant.ts";
import { createApartmentPage } from "../../src/pages/apartment.page.ts";
import { ROLE_ACCESS } from "../../src/constants/role-access.constant.ts";
import { USER_ROLE_VALUES } from "../../src/constants/user-role.constant.ts";
import { getAuthStatePath } from "../../src/utilities/auth-state.utility.ts";
import { HTTP_METHODS, HTTP_STATUS } from "../../src/constants/http.constant.ts";
import { DRIVE_COPY, PROJECT_PAGE_COPY } from "../../src/constants/copy.constant.ts";
import { createDriveManagement } from "../../src/pages/drive-management.component.ts";
import { DRIVE_MANAGEMENT_COPY as COPY } from "../../src/constants/drive-management.constant.ts";

const PDF = {
  name: "תוכנית.pdf",
  mimeType: MIME_TYPES.PDF,
  buffer: Buffer.from("%PDF-1.4\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF\n"),
};
const deferred = () => {
  const pending = { resolve: () => {} };
  const promise = new Promise<void>(resolve => {
    pending.resolve = resolve;
  });
  return { promise, resolve: () => pending.resolve() };
};
const expectFits = async (page: Page) => {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  for (const dialog of await page.getByRole("dialog").all()) {
    expect(await dialog.evaluate(element => element.scrollWidth <= element.clientWidth + 1)).toBe(
      true,
    );
  }
};

for (const kind of ["standalone", "building", "apartment"] as const) {
  test(`${kind} uploads choose nested and root destinations, cancel without POST, retain validation and one input`, async ({
    page,
    api,
  }) => {
    const customer = await seedCustomer(api);
    const parent =
      kind === "standalone"
        ? await seedStandaloneProject(api, customer)
        : await seedBuilding(api, customer);
    const project = kind === "apartment" ? await seedApartment(api, parent) : parent;
    const mock = await mockDriveManagement(page, project.id);
    const ui = createDriveManagement(page);
    await (kind === "apartment"
      ? createApartmentPage(page).goto(parent.id, project.id)
      : ui.goto(project.id));
    await expect(ui.uploadInput).toHaveCount(1);
    await expect(page.getByText(PROJECT_PAGE_COPY.TIMELINE_TITLE)).toBeVisible();
    await page.getByRole("button", { name: COPY.CHOOSE, exact: true }).click();
    await ui.browse(FOLDERS.SOURCE.name);
    await ui.browse(FOLDERS.NESTED.name);
    await expect(ui.dialog).toContainText(
      `${COPY.ROOT} / ${FOLDERS.SOURCE.name} / ${FOLDERS.NESTED.name}`,
    );
    await expect(ui.dialog.getByText(COPY.EMPTY)).toBeVisible();
    await ui.cancel.click();
    expect(mock.requests.uploads).toHaveLength(0);
    await page.getByRole("button", { name: COPY.CHOOSE, exact: true }).click();
    await ui.browse(FOLDERS.SOURCE.name);
    await ui.browse(FOLDERS.NESTED.name);
    await ui.dialog.getByRole("button", { name: COPY.SELECT, exact: true }).click();
    await expect(
      page.getByText(`יעד העלאה: ${COPY.ROOT} / ${FOLDERS.SOURCE.name} / ${FOLDERS.NESTED.name}`, {
        exact: true,
      }),
    ).toBeVisible();
    await ui.uploadInput.setInputFiles({
      name: "bad.exe",
      mimeType: MIME_TYPES.BINARY,
      buffer: Buffer.from("MZ"),
    });
    await expect(page.getByText(DRIVE_COPY.UNSUPPORTED_FILE)).toBeVisible();
    expect(mock.requests.uploads).toHaveLength(0);
    const pending = deferred();
    mock.state.holdMutation = pending.promise;
    await ui.uploadInput.setInputFiles(PDF);
    await expect.poll(() => mock.requests.uploads.length).toBe(1);
    await expect(ui.uploadInput).toBeDisabled();
    await expect(page.getByRole("button", { name: COPY.CHOOSE, exact: true })).toBeDisabled();
    pending.resolve();
    await expect(ui.driveCard.getByText(COPY.UPLOAD_SUCCESS)).toBeVisible();
    expect(mock.requests.uploads[0]).toMatchObject({ folderId: FOLDERS.NESTED.id });
    expect(mock.requests.uploads[0].contentType).toContain("multipart/form-data; boundary=");
    expect(mock.requests.uploads[0].body).toContain(PDF.name);
    expect(mock.requests.uploads[0].body).toContain(PDF.buffer.toString());
    await page.getByRole("button", { name: COPY.CHOOSE, exact: true }).click();
    await ui.browse(COPY.BACK);
    await ui.browse(COPY.BACK);
    await ui.dialog.getByRole("button", { name: COPY.SELECT, exact: true }).click();
    await ui.uploadInput.setInputFiles(PDF);
    await expect.poll(() => mock.requests.uploads.length).toBe(2);
    expect(mock.requests.uploads[1].folderId).toBeNull();
  });
}

for (const width of [1440, 390]) {
  test(`move nested file to sibling and root, preserve identity, refresh badges and trash safely at ${width}px`, async ({
    page,
    api,
  }, testInfo) => {
    await page.setViewportSize({ width, height: 1000 });
    const project = await seedStandaloneProject(api, await seedCustomer(api));
    const mock = await mockDriveManagement(page, project.id);
    const ui = createDriveManagement(page);
    await ui.goto(project.id);
    await ui.expandNested();
    await ui.move.click();
    await expect(ui.dialog).toContainText(
      `תיקייה נוכחית: ${COPY.ROOT} / ${FOLDERS.SOURCE.name} / ${FOLDERS.NESTED.name}`,
    );
    await ui.browse(FOLDERS.SOURCE.name);
    await ui.browse(FOLDERS.NESTED.name);
    await expectFits(page);
    await page.screenshot({
      path: testInfo.outputPath(`move-long-nested-${width}.png`),
      fullPage: true,
    });
    await ui.cancel.click();
    expect(mock.requests.mutations).toHaveLength(0);
    await ui.move.click();
    await ui.browse(FOLDERS.TARGET.name);
    const before = mock.requests.contents.length;
    const pending = deferred();
    mock.state.holdMutation = pending.promise;
    await ui.confirmMove.click();
    await expect(ui.confirmMove).toBeDisabled();
    await expect(ui.cancel).toBeDisabled();
    await page.keyboard.press("Escape");
    await page.locator(".MuiBackdrop-root").click({ position: { x: 1, y: 1 }, force: true });
    await expect(ui.dialog).toBeVisible();
    expect(mock.requests.mutations).toEqual([
      { method: HTTP_METHODS.PATCH, fileId: MANAGEMENT_FILE.id, folderId: FOLDERS.TARGET.id },
    ]);
    pending.resolve();
    await expect(ui.dialog).toHaveCount(0);
    await expect(ui.driveCard.getByText(COPY.MOVE_SUCCESS)).toBeVisible();
    await expect(ui.file).toHaveCount(0);
    await expect(
      ui.driveFolder(FOLDERS.SOURCE.name).getByRole("img", { name: DRIVE_COPY.EMPTY_FOLDER }),
    ).toBeVisible();
    await expect(
      ui.driveFolder(FOLDERS.TARGET.name).getByRole("img", { name: DRIVE_COPY.FOLDER_HAS_FILES }),
    ).toBeVisible();
    expect(mock.requests.contents.slice(before)).toEqual(
      expect.arrayContaining([
        FOLDERS.ROOT,
        FOLDERS.SOURCE.id,
        FOLDERS.NESTED.id,
        FOLDERS.TARGET.id,
      ]),
    );
    await ui.driveFolder(FOLDERS.TARGET.name).click();
    await expect(ui.file).toHaveAttribute("href", MANAGEMENT_FILE.webViewLink);
    await ui.move.click();
    const beforeRootMove = mock.requests.contents.length;
    await ui.confirmMove.click();
    await expect(ui.dialog).toHaveCount(0);
    await expect(ui.file).toHaveAttribute("href", MANAGEMENT_FILE.webViewLink);
    expect(mock.requests.contents.slice(beforeRootMove)).toEqual(
      expect.arrayContaining([FOLDERS.ROOT, FOLDERS.TARGET.id]),
    );
    expect(mock.requests.mutations[1]).toEqual({
      method: HTTP_METHODS.PATCH,
      fileId: MANAGEMENT_FILE.id,
    });
    await ui.trash.click();
    await expect(ui.dialog.getByText(COPY.RECOVERABLE)).toBeVisible();
    await expectFits(page);
    await page.screenshot({ path: testInfo.outputPath(`trash-long-${width}.png`), fullPage: true });
    await ui.cancel.click();
    expect(mock.requests.mutations).toHaveLength(2);
    await expect(ui.file).toBeVisible();
    await ui.trash.click();
    const trashPending = deferred();
    mock.state.holdMutation = trashPending.promise;
    const beforeTrash = mock.requests.contents.length;
    const confirmTrash = ui.dialog.getByRole("button", { name: COPY.TRASH, exact: true });
    await confirmTrash.click();
    await expect(confirmTrash).toBeDisabled();
    await expect(ui.cancel).toBeDisabled();
    await page.keyboard.press("Escape");
    await expect(ui.dialog).toBeVisible();
    await expect(ui.driveCard.getByText(COPY.MOVE_SUCCESS)).toHaveCount(0);
    expect(mock.requests.mutations).toHaveLength(3);
    trashPending.resolve();
    await expect(ui.dialog).toHaveCount(0);
    await expect(ui.file).toHaveCount(0);
    await expect(ui.driveCard.getByText(COPY.TRASH_SUCCESS)).toBeVisible();
    await expect(ui.driveCard.getByText(DRIVE_COPY.EMPTY_FOLDER, { exact: true })).toBeVisible();
    expect(mock.requests.mutations[2]).toEqual({
      method: HTTP_METHODS.DELETE,
      fileId: MANAGEMENT_FILE.id,
    });
    expect(mock.requests.contents.slice(beforeTrash)).toEqual(
      expect.arrayContaining([FOLDERS.ROOT, FOLDERS.TARGET.id]),
    );
    expect(mock.files.size).toBe(0);
    const other = await seedStandaloneProject(api, await seedCustomer(api));
    await mockDriveManagement(page, other.id);
    await ui.goto(other.id);
    await expect(ui.driveCard.getByText(COPY.TRASH_SUCCESS)).toHaveCount(0);
  });
}

for (const role of USER_ROLE_VALUES) {
  test.describe(`${role} file management`, () => {
    test.use({ storageState: getAuthStatePath(role) });
    test("existing project editor policy governs move/trash while uploads remain authenticated", async ({
      page,
      api,
    }) => {
      const project = await seedStandaloneProject(api, await seedCustomer(api));
      await mockDriveManagement(page, project.id);
      const ui = createDriveManagement(page);
      await ui.goto(project.id);
      await ui.expandNested();
      await expect(ui.file).toBeVisible();
      await expect(ui.move).toHaveCount(ROLE_ACCESS[role].canEditProject ? 1 : 0);
      await expect(ui.trash).toHaveCount(ROLE_ACCESS[role].canEditProject ? 1 : 0);
      await expect(ui.uploadInput).toBeEnabled();
      await expect(page.getByRole("button", { name: COPY.CHOOSE, exact: true })).toBeEnabled();
    });
  });
}

for (const operation of ["move", "trash"] as const) {
  for (const status of [
    HTTP_STATUS.BAD_REQUEST,
    HTTP_STATUS.FORBIDDEN,
    HTTP_STATUS.NOT_FOUND,
    HTTP_STATUS.BAD_GATEWAY,
  ]) {
    test(`${operation} ${status} keeps the named file and dialog for a successful retry`, async ({
      page,
      api,
    }) => {
      const project = await seedStandaloneProject(api, await seedCustomer(api));
      const mock = await mockDriveManagement(page, project.id);
      mock.state.mutationStatus = status;
      const ui = createDriveManagement(page);
      await ui.goto(project.id);
      await ui.expandNested();
      await ui[operation].click();
      const confirm =
        operation === "move"
          ? ui.confirmMove
          : ui.dialog.getByRole("button", { name: COPY.TRASH, exact: true });
      await confirm.click();
      await expect(ui.dialog.getByText(COPY.ACTION_ERROR)).toBeVisible();
      await expect(ui.dialog).toContainText(MANAGEMENT_FILE.name);
      await expect(ui.dialog).not.toContainText("GaxiosError");
      await expect(confirm).toBeEnabled();
      expect(mock.files.get(MANAGEMENT_FILE.id)?.parent).toBe(FOLDERS.NESTED.id);
      mock.state.mutationStatus = HTTP_STATUS.NO_CONTENT;
      await confirm.click();
      await expect(ui.dialog).toHaveCount(0);
      await expect(
        ui.driveCard.getByText(operation === "move" ? COPY.MOVE_SUCCESS : COPY.TRASH_SUCCESS),
      ).toBeVisible();
      expect(mock.requests.mutations).toHaveLength(2);
    });
  }
}

test("picker loading and friendly folder error disable selection; retry and empty nested folders recover", async ({
  page,
  api,
}) => {
  const project = await seedStandaloneProject(api, await seedCustomer(api));
  const mock = await mockDriveManagement(page, project.id);
  const ui = createDriveManagement(page);
  await ui.goto(project.id);
  await page.getByRole("button", { name: COPY.CHOOSE, exact: true }).click();
  const pending = deferred();
  mock.state.holdContents = pending.promise;
  mock.state.failContents = FOLDERS.TARGET.id;
  await ui.browse(FOLDERS.TARGET.name);
  const select = ui.dialog.getByRole("button", { name: COPY.SELECT, exact: true });
  await expect(ui.dialog.getByText(COPY.LOADING)).toBeVisible();
  await expect(select).toBeDisabled();
  pending.resolve();
  await expect(ui.dialog.getByText(COPY.FOLDER_ERROR)).toBeVisible();
  await expect(select).toBeDisabled();
  mock.state.failContents = null;
  await ui.dialog.getByRole("button", { name: DRIVE_COPY.RETRY, exact: true }).click();
  await expect(ui.dialog.getByText(COPY.EMPTY)).toBeVisible();
  await expect(select).toBeEnabled();
  await select.click();
  expect(mock.requests.uploads).toHaveLength(0);
});

test("same-folder move is harmless and preserves the file link", async ({ page, api }) => {
  const project = await seedStandaloneProject(api, await seedCustomer(api));
  const mock = await mockDriveManagement(page, project.id);
  const ui = createDriveManagement(page);
  await ui.goto(project.id);
  await ui.expandNested();
  await ui.move.click();
  await ui.browse(FOLDERS.SOURCE.name);
  await ui.browse(FOLDERS.NESTED.name);
  await ui.confirmMove.click();
  await expect(ui.dialog).toHaveCount(0);
  await expect(ui.file).toHaveAttribute("href", MANAGEMENT_FILE.webViewLink);
  expect(mock.files.get(MANAGEMENT_FILE.id)?.parent).toBe(FOLDERS.NESTED.id);
});

test("a root file moves into a nested destination without changing its identity or link", async ({
  page,
  api,
}) => {
  const project = await seedStandaloneProject(api, await seedCustomer(api));
  const mock = await mockDriveManagement(page, project.id);
  const file = mock.files.get(MANAGEMENT_FILE.id);
  if (!file) {
    throw new Error("Missing seeded Drive file");
  }
  file.parent = FOLDERS.ROOT;
  const ui = createDriveManagement(page);
  await ui.goto(project.id);
  await expect(ui.file).toHaveAttribute("href", MANAGEMENT_FILE.webViewLink);
  await ui.move.click();
  await expect(ui.dialog).toContainText(`תיקייה נוכחית: ${COPY.ROOT}`);
  await ui.browse(FOLDERS.SOURCE.name);
  await ui.browse(FOLDERS.NESTED.name);
  await ui.confirmMove.click();
  await expect(ui.dialog).toHaveCount(0);
  await expect(ui.file).toHaveCount(0);
  await ui.expandNested();
  await expect(ui.file).toHaveAttribute("href", MANAGEMENT_FILE.webViewLink);
  expect(mock.requests.mutations).toEqual([
    { method: HTTP_METHODS.PATCH, fileId: MANAGEMENT_FILE.id, folderId: FOLDERS.NESTED.id },
  ]);
});
