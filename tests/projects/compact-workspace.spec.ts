import {
  seedTask,
  seedCustomer,
  seedBuilding,
  seedApartment,
  seedStandaloneProject,
} from "../../src/api/seed-data.ts";

import {
  MANAGEMENT_FILE,
  MANAGEMENT_FOLDERS,
  mockDriveManagement,
} from "../../src/mocks/drive-management.mock.ts";

import { test, expect } from "../../src/fixtures/test.fixture.ts";
import { createProjectPage } from "../../src/pages/project.page.ts";
import { HTTP_METHODS } from "../../src/constants/http.constant.ts";
import { ROOT_FOLDER_ID, MOCK_DRIVE_FILE } from "../../src/mocks/drive.mock.ts";
import { openWorkspaceTab } from "../../src/pages/project-workspace.component.ts";
import { PROJECT_CONTACT_ROLES } from "../../src/constants/project-contact-role.constant.ts";
import { buildApartmentRoute, buildProjectRoute } from "../../src/utilities/route.utility.ts";
import { seedRoleContact, contactRolePath } from "../../src/api/project-contact-roles.api.ts";

for (const kind of ["standalone", "building", "apartment"] as const) {
  for (const width of [1280, 390]) {
    test(`${kind} compact tasks and people remain usable at ${width}px`, async ({
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
      const task = await seedTask(api, { link: { projectId: project.id } });
      const contact = await seedRoleContact(api);
      expect(
        (
          await api.send(
            HTTP_METHODS.PUT,
            contactRolePath(project.id, PROJECT_CONTACT_ROLES.ARCHITECT),
            { contactId: contact.id },
          )
        ).ok(),
      ).toBe(true);
      await page.goto(
        kind === "apartment"
          ? buildApartmentRoute(parent.id, project.id)
          : buildProjectRoute(project.id),
      );
      const tabs = page.getByRole("tablist", { name: "לשוניות הפרויקט", exact: true });
      const create = createProjectPage(page).newTaskButton;
      const row = page.getByRole("button", { name: task.title, exact: true });
      await expect(create).toBeVisible();
      const tabBox = await tabs.boundingBox(),
        createBox = await create.boundingBox(),
        rowBox = await row.boundingBox();
      expect(tabBox && createBox && rowBox).toBeTruthy();
      if (width === 1280) {
        expect(Math.abs(createBox!.y - tabBox!.y)).toBeLessThan(15);
        expect(
          rowBox!.y - Math.max(tabBox!.y + tabBox!.height, createBox!.y + createBox!.height),
        ).toBeLessThan(40);
      }
      await openWorkspaceTab(page, "people");
      if (width === 390) await page.getByRole("button", { name: "אנשי קשר", exact: true }).click();
      await expect(page.getByText("אדריכל", { exact: true })).toBeVisible();
      await expect(page.getByText("מנהל פרויקט", { exact: true })).toBeVisible();
      await expect(page.getByText("יועץ", { exact: true })).toBeVisible();
      await expect(page.getByText(contact.name, { exact: true })).toBeVisible();
      await page.getByRole("button", { name: "ערוך אדריכל", exact: true }).click();
      await expect(
        page
          .getByRole("dialog")
          .getByRole("combobox", { name: "אדריכל", exact: true })
          .and(page.locator("input[readonly]")),
      ).toHaveValue(contact.name);
      await page.getByRole("dialog").getByRole("button", { name: "סיום", exact: true }).click();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      );
      if (width === 1280)
        expect(
          await page.evaluate(() => document.documentElement.scrollHeight - innerHeight),
        ).toBeLessThanOrEqual(1);
      await page.screenshot({ path: info.outputPath(`people-${kind}-${width}.png`) });
    });
  }
}

test("folder navigation replaces the current list and upload inherits the current folder", async ({
  page,
  api,
}) => {
  const project = await seedStandaloneProject(api, await seedCustomer(api));
  const mock = await mockDriveManagement(page, project.id);
  const ui = createProjectPage(page);
  await ui.goto(project.id);
  await openWorkspaceTab(page, "files");
  await ui.driveFolder(MANAGEMENT_FOLDERS.SOURCE.name).click();
  await expect(ui.driveFolder(MANAGEMENT_FOLDERS.TARGET.name)).toHaveCount(0);
  await ui.driveFolder(MANAGEMENT_FOLDERS.NESTED.name).click();
  await expect(
    ui.driveCard.getByRole("link", { name: MANAGEMENT_FILE.name, exact: true }),
  ).toHaveAttribute("href", MANAGEMENT_FILE.webViewLink);
  await page.getByRole("button", { name: "העלאת קבצים", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "העלאת קבצים", exact: true });
  await expect(dialog).toContainText(MANAGEMENT_FOLDERS.NESTED.name);
  await ui.uploadInput.setInputFiles({
    name: "תוכנית.pdf",
    mimeType: "application/pdf",
    buffer: Buffer.from("%PDF-1.4\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF\n"),
  });
  await expect.poll(() => mock.requests.uploads.length).toBe(1);
  expect(mock.requests.uploads[0].folderId).toBe(MANAGEMENT_FOLDERS.NESTED.id);
  await dialog.getByRole("button", { name: "סיום", exact: true }).click();
  await page
    .getByRole("navigation", { name: "נתיב התיקייה" })
    .getByRole("button", { name: "תיקיית הפרויקט", exact: true })
    .click();
  await expect(ui.driveFolder(MANAGEMENT_FOLDERS.TARGET.name)).toBeVisible();
});

for (const width of [1280, 390]) {
  test(`file pagination exposes every file while keeping the list compact at ${width}px`, async ({
    page,
    api,
  }, info) => {
    await page.setViewportSize({ width, height: 800 });
    const project = await seedStandaloneProject(api, await seedCustomer(api));
    await page.route(`**/api/project-drive/${project.id}/contents**`, route =>
      route.fulfill({
        json: {
          folderId: ROOT_FOLDER_ID,
          folders: [],
          files: Array.from({ length: 8 }, (_, i) => ({
            ...MOCK_DRIVE_FILE,
            id: `file-${i}`,
            name: `פריט ${i}.pdf`,
          })),
        },
      }),
    );
    const ui = createProjectPage(page);
    await ui.goto(project.id);
    await openWorkspaceTab(page, "files");
    await expect(ui.driveCard.getByRole("link", { name: "פריט 0.pdf", exact: true })).toBeVisible();
    await ui.driveCard.getByRole("button", { name: "הבא", exact: true }).click();
    await expect(ui.driveCard.getByRole("link", { name: "פריט 3.pdf", exact: true })).toBeVisible();
    await expect(ui.driveCard.getByRole("link", { name: "פריט 0.pdf", exact: true })).toHaveCount(
      0,
    );
    await ui.driveCard.getByRole("button", { name: "הבא", exact: true }).click();
    await expect(ui.driveCard.getByRole("link", { name: "פריט 7.pdf", exact: true })).toBeVisible();
    if (width === 1280)
      expect(
        await page.evaluate(() => document.documentElement.scrollHeight - innerHeight),
      ).toBeLessThanOrEqual(1);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await page.screenshot({ path: info.outputPath(`files-${width}.png`) });
  });
}

test("additional contacts paginate while each professional role remains visible", async ({
  page,
  api,
}) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  const project = await seedStandaloneProject(api, await seedCustomer(api));
  const contacts = [];
  for (let i = 0; i < 5; i++) {
    const contact = await seedRoleContact(api);
    contacts.push(contact);
    expect(
      (
        await api.send(HTTP_METHODS.POST, `/project/${project.id}/contacts`, {
          contactId: contact.id,
          role: `תפקיד ${i}`,
        })
      ).ok(),
    ).toBe(true);
  }
  await createProjectPage(page).goto(project.id);
  await openWorkspaceTab(page, "people");
  const next = page.getByRole("button", { name: "אנשי קשר הבאים", exact: true });
  await expect(next).toBeEnabled();
  const visited = new Set<string>();
  for (let i = 0; i < 3; i++) {
    for (const contact of contacts)
      if (await page.getByText(contact.name, { exact: true }).isVisible()) visited.add(contact.id);
    await expect(page.getByText("אדריכל", { exact: true })).toBeVisible();
    if (i < 2) await next.click();
  }
  expect(visited.size).toBe(contacts.length);
  expect(
    await page.evaluate(() => document.documentElement.scrollHeight - innerHeight),
  ).toBeLessThanOrEqual(1);
});
