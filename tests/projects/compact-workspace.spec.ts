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

import { seedUser } from "../../src/api/seed-data.ts";
import { test, expect } from "../../src/fixtures/test.fixture.ts";
import { createProjectPage } from "../../src/pages/project.page.ts";
import { HTTP_METHODS } from "../../src/constants/http.constant.ts";
import { USER_ROLES } from "../../src/constants/user-role.constant.ts";
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
        const gap =
          rowBox!.y - Math.max(tabBox!.y + tabBox!.height, createBox!.y + createBox!.height);
        expect(gap).toBeGreaterThanOrEqual(0);
        expect(gap).toBeLessThanOrEqual(24);
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
      if (width === 1280) {
        expect(
          await page
            .getByRole("tabpanel", { name: "אנשי קשר וצוות", exact: true })
            .evaluate(el => el.scrollHeight - el.clientHeight),
        ).toBeLessThanOrEqual(1);
        expect(
          await page.evaluate(() => document.documentElement.scrollHeight - innerHeight),
        ).toBeLessThanOrEqual(1);
      }
      await page.screenshot({ path: info.outputPath(`people-${kind}-${width}.png`) });
    });
  }
}

test("folder accordions preserve sibling folders and inline upload can target a nested destination", async ({
  page,
  api,
}) => {
  const project = await seedStandaloneProject(api, await seedCustomer(api));
  const mock = await mockDriveManagement(page, project.id);
  const ui = createProjectPage(page);
  await ui.goto(project.id);
  await openWorkspaceTab(page, "files");
  await ui.driveFolder(MANAGEMENT_FOLDERS.SOURCE.name).click();
  await expect(ui.driveFolder(MANAGEMENT_FOLDERS.TARGET.name)).toBeVisible();
  await ui.driveFolder(MANAGEMENT_FOLDERS.NESTED.name).click();
  await expect(
    ui.driveCard.getByRole("link", { name: MANAGEMENT_FILE.name, exact: true }),
  ).toHaveAttribute("href", MANAGEMENT_FILE.webViewLink);
  await expect(ui.uploadInput).toHaveCount(1);
  await ui.driveCard.getByRole("button", { name: "בחירת תיקייה", exact: true }).click();
  const dialog = page.getByRole("dialog").last();
  await dialog.getByRole("button", { name: MANAGEMENT_FOLDERS.SOURCE.name, exact: true }).click();
  await dialog.getByRole("button", { name: MANAGEMENT_FOLDERS.NESTED.name, exact: true }).click();
  await dialog.getByRole("button", { name: "בחר תיקייה זו", exact: true }).click();
  await ui.uploadInput.setInputFiles({
    name: "תוכנית.pdf",
    mimeType: "application/pdf",
    buffer: Buffer.from("%PDF-1.4\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF\n"),
  });
  await expect.poll(() => mock.requests.uploads.length).toBe(1);
  expect(mock.requests.uploads[0].folderId).toBe(MANAGEMENT_FOLDERS.NESTED.id);
});

for (const width of [1280, 390]) {
  test(`inline Drive file list retains every record at ${width}px`, async ({ page, api }, info) => {
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
    for (let i = 0; i < 8; i++)
      await expect(
        ui.driveCard.getByRole("link", { name: `פריט ${i}.pdf`, exact: true }),
      ).toBeVisible();
    await expect(ui.driveCard.getByRole("button", { name: "הבא", exact: true })).toHaveCount(0);
    await ui.driveCard
      .getByRole("button", { name: "בחר קבצים מהמחשב", exact: true })
      .scrollIntoViewIfNeeded();
    await expect(
      ui.driveCard.getByRole("button", { name: "בחר קבצים מהמחשב", exact: true }),
    ).toBeInViewport();
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
    if (i < 2) {
      const visibleNames = [];
      for (const contact of contacts)
        if (await page.getByText(contact.name, { exact: true }).isVisible())
          visibleNames.push(contact.name);
      await next.click();
      await expect(page.getByText(visibleNames[0], { exact: true })).toHaveCount(0);
    }
  }
  expect(visited.size).toBe(contacts.length);
  expect(
    await page.evaluate(() => document.documentElement.scrollHeight - innerHeight),
  ).toBeLessThanOrEqual(1);
});

test("assigned team has compact callable rows and paginates every member", async ({
  page,
  api,
}) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  const project = await seedStandaloneProject(api, await seedCustomer(api));
  const users: Awaited<ReturnType<typeof seedUser>>[] = [];
  for (let i = 0; i < 6; i++) users.push(await seedUser(api, USER_ROLES.INSTALLER));
  const stored = await api.getProject(project.id);
  await page.route(`**/api/project/${project.id}`, route =>
    route.fulfill({
      json: {
        ...stored,
        members: users.map(user => ({
          id: crypto.randomUUID(),
          userId: user.id,
          role: USER_ROLES.INSTALLER,
          user,
        })),
      },
    }),
  );
  await createProjectPage(page).goto(project.id);
  await openWorkspaceTab(page, "people");
  for (const user of users.slice(0, 5)) {
    await expect(
      page.getByText(`${user.firstName} ${user.lastName}`, { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: `התקשר ${user.firstName} ${user.lastName}`, exact: true }),
    ).toBeVisible();
  }
  await page.getByRole("button", { name: "עובדים הבאים", exact: true }).click();
  await expect(
    page.getByText(`${users[5].firstName} ${users[5].lastName}`, { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText(`${users[0].firstName} ${users[0].lastName}`, { exact: true }),
  ).toHaveCount(0);
  expect(
    await page
      .getByRole("tabpanel", { name: "אנשי קשר וצוות", exact: true })
      .evaluate(el => el.scrollHeight - el.clientHeight),
  ).toBeLessThanOrEqual(1);
});
