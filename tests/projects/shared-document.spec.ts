import type { Page, Route } from "@playwright/test";
import { test, expect } from "../../src/fixtures/test.fixture.ts";
import { createProjectPage } from "../../src/pages/project.page.ts";
import { USER_ROLES } from "../../src/constants/user-role.constant.ts";
import { createApartmentPage } from "../../src/pages/apartment.page.ts";
import { TEST_USERS } from "../../src/constants/test-users.constant.ts";
import { getAuthStatePath } from "../../src/utilities/auth-state.utility.ts";
import { MOCK_DRIVE_FILE, ROOT_FOLDER_ID } from "../../src/mocks/drive.mock.ts";
import { DRIVE_CONTENT_STATUSES } from "../../src/constants/domain.constant.ts";
import { HTTP_METHODS, HTTP_STATUS } from "../../src/constants/http.constant.ts";
import { API_PATHS, API_PROXY_PREFIX } from "../../src/constants/api.constant.ts";
import { seedApartment, seedBuilding, seedCustomer } from "../../src/api/seed-data.ts";

const COPY = {
  select: "הגדר כמסמך משותף",
  selected: "משותף לדירות",
  clear: "נקה בחירה",
  open: "פתח מסמך משותף ב-Drive",
  empty: "טרם נבחר מסמך משותף בפרויקט האב.",
  unavailable: "המסמך המשותף אינו זמין ב-Drive. פנו לעורך פרויקט האב לבחירת קובץ אחר.",
  parentUnavailable: "הקובץ שנבחר אינו זמין. בחרו קובץ אחר או נקו את הבחירה.",
} as const;

const NESTED_ID = "shared-document-nested-folder";
const FILES = [
  MOCK_DRIVE_FILE,
  { ...MOCK_DRIVE_FILE, id: "second-plan-file", name: "תוכנית מעודכנת.pdf" },
];
const sharedPath = (projectId: string) =>
  `**${API_PROXY_PREFIX}${API_PATHS.PROJECT_DRIVE}/${projectId}/shared-document`;
const contentsPath = (projectId: string) =>
  `**${API_PROXY_PREFIX}${API_PATHS.PROJECT_DRIVE}/${projectId}/contents**`;

const mockParentContents = async (page: Page, projectId: string) => {
  await page.route(contentsPath(projectId), route => {
    const nested = new URL(route.request().url()).searchParams.get("folderId") === NESTED_ID;
    return route.fulfill({
      json: {
        folderId: nested ? NESTED_ID : ROOT_FOLDER_ID,
        files: nested ? FILES : [],
        folders: nested
          ? []
          : [
              {
                id: NESTED_ID,
                name: "תוכניות",
                fileCount: FILES.length,
                contentStatus: DRIVE_CONTENT_STATUSES.HAS_CONTENT,
              },
            ],
      },
    });
  });
};

const mockSelection = async (page: Page, parentId: string, apartmentIds: string[]) => {
  const state = { selected: null as string | null, unavailable: false, noAccess: false };
  const mutations: { projectId: string; fileId: string | null }[] = [];
  const answer = (route: Route) => {
    if (state.noAccess) {
      return route.fulfill({ status: 503, json: { message: "Drive access is unavailable" } });
    }
    const file = FILES.find(candidate => candidate.id === state.selected);
    if (!file) {
      return route.fulfill({ json: { status: "none", file: null } });
    }
    if (state.unavailable) {
      return route.fulfill({ json: { status: "unavailable", file: null } });
    }
    return route.fulfill({
      json: {
        status: "available",
        file: {
          id: file.id,
          name: file.name,
          url: `https://drive.google.com/open?id=${file.id}`,
        },
      },
    });
  };
  for (const projectId of [parentId, ...apartmentIds]) {
    await page.route(sharedPath(projectId), route => {
      if (route.request().method() !== "PATCH") return answer(route);
      const body: unknown = route.request().postDataJSON();
      if (
        projectId !== parentId ||
        !body ||
        typeof body !== "object" ||
        !("fileId" in body) ||
        (body.fileId !== null && typeof body.fileId !== "string")
      ) {
        return route.fulfill({ status: 400, json: { message: "Invalid selection" } });
      }
      mutations.push({ projectId, fileId: body.fileId });
      state.selected = body.fileId;
      return answer(route);
    });
  }
  return { state, mutations };
};

test("one nested parent selection reaches two apartments, replacement and clearing refetch the parent", async ({
  page,
  api,
}) => {
  const parent = await seedBuilding(api, await seedCustomer(api));
  const apartments = [await seedApartment(api, parent), await seedApartment(api, parent)];
  const mock = await mockSelection(
    page,
    parent.id,
    apartments.map(apartment => apartment.id),
  );
  await mockParentContents(page, parent.id);
  await createProjectPage(page).goto(parent.id);
  await page.getByRole("button", { name: /תוכניות/ }).click();
  const select = page.getByRole("button", { name: COPY.select, exact: true });
  await expect(select).toHaveCount(2);
  await select.first().click();
  await expect(page.getByRole("button", { name: COPY.selected })).toBeDisabled();
  expect(mock.mutations).toEqual([{ projectId: parent.id, fileId: FILES[0].id }]);

  for (const apartment of apartments) {
    await createApartmentPage(page).goto(parent.id, apartment.id);
    const shortcut = page.getByRole("link", { name: COPY.open });
    await expect(shortcut).toHaveAttribute(
      "href",
      `https://drive.google.com/open?id=${FILES[0].id}`,
    );
    await expect(shortcut).toHaveAttribute("target", "_blank");
    await expect(shortcut).toHaveAttribute("rel", "noopener noreferrer");
    await expect(page.getByText(FILES[0].name, { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: COPY.select })).toHaveCount(0);
  }

  await createProjectPage(page).goto(parent.id);
  await page.getByRole("button", { name: /תוכניות/ }).click();
  await page.getByRole("button", { name: COPY.select, exact: true }).click();
  await expect(page.getByText(FILES[1].name, { exact: true })).toBeVisible();
  expect(mock.mutations.at(-1)).toEqual({ projectId: parent.id, fileId: FILES[1].id });
  for (const apartment of apartments) {
    await createApartmentPage(page).goto(parent.id, apartment.id);
    await expect(page.getByRole("link", { name: COPY.open })).toHaveAttribute(
      "href",
      `https://drive.google.com/open?id=${FILES[1].id}`,
    );
    await expect(page.getByText(FILES[0].name, { exact: true })).toHaveCount(0);
  }

  await createProjectPage(page).goto(parent.id);
  await page.getByRole("button", { name: COPY.clear }).click();
  expect(mock.mutations.at(-1)).toEqual({ projectId: parent.id, fileId: null });
  await createApartmentPage(page).goto(parent.id, apartments[0].id);
  await expect(page.getByText(COPY.empty)).toBeVisible();
  await expect(page.getByRole("link", { name: COPY.open })).toHaveCount(0);
});

test("missing, unavailable, and inaccessible documents never expose an unsafe shortcut", async ({
  page,
  api,
}) => {
  const parent = await seedBuilding(api, await seedCustomer(api));
  const apartment = await seedApartment(api, parent);
  const mock = await mockSelection(page, parent.id, [apartment.id]);
  await createApartmentPage(page).goto(parent.id, apartment.id);
  await expect(page.getByText(COPY.empty)).toBeVisible();
  mock.state.selected = FILES[0].id;
  mock.state.unavailable = true;
  await page.reload();
  await expect(page.getByText(COPY.unavailable)).toBeVisible();
  await expect(page.getByRole("link", { name: COPY.open })).toHaveCount(0);
  mock.state.noAccess = true;
  await page.reload();
  await expect(page.getByText("Drive access is unavailable")).toBeVisible();
  await expect(page.getByRole("link", { name: COPY.open })).toHaveCount(0);
  mock.state.noAccess = false;
  await mockParentContents(page, parent.id);
  await createProjectPage(page).goto(parent.id);
  await expect(page.getByText(COPY.parentUnavailable)).toBeVisible();
  await expect(page.getByRole("button", { name: COPY.clear })).toBeVisible();
});

test("real shared-document API keeps reads available and changes limited to Drive editors", async ({
  api,
  apiAs,
}) => {
  const parent = await seedBuilding(api, await seedCustomer(api));
  const apartment = await seedApartment(api, parent);
  const path = `${API_PATHS.PROJECT_DRIVE}/${parent.id}/shared-document`;
  const apartmentPath = `${API_PATHS.PROJECT_DRIVE}/${apartment.id}/shared-document`;

  for (const role of [USER_ROLES.ENGINEER, USER_ROLES.INSTALLER, USER_ROLES.FINANCE]) {
    const actor = await apiAs(TEST_USERS[role]);
    const read = await actor.send(HTTP_METHODS.GET, path);
    expect(read.status()).toBe(HTTP_STATUS.OK);
    expect(await read.json()).toEqual({ status: "none", file: null });
    expect((await actor.send(HTTP_METHODS.PATCH, path, { fileId: null })).status()).toBe(
      HTTP_STATUS.FORBIDDEN,
    );
  }

  for (const role of [USER_ROLES.SYSTEM_ADMIN, USER_ROLES.PROJECT_MANAGER, USER_ROLES.SECRETARY]) {
    const actor = await apiAs(TEST_USERS[role]);
    expect((await actor.send(HTTP_METHODS.PATCH, path, { fileId: null })).status()).toBe(
      HTTP_STATUS.OK,
    );
    expect((await actor.send(HTTP_METHODS.PATCH, apartmentPath, { fileId: null })).status()).toBe(
      HTTP_STATUS.BAD_REQUEST,
    );
  }
});

test.describe("engineer read-only shared document", () => {
  test.use({ storageState: getAuthStatePath(USER_ROLES.ENGINEER) });
  test("can browse the parent file without selecting or clearing it", async ({ page, api }) => {
    const parent = await seedBuilding(api, await seedCustomer(api));
    await mockParentContents(page, parent.id);
    await createProjectPage(page).goto(parent.id);
    await page.getByRole("button", { name: /תוכניות/ }).click();
    await expect(page.getByText(FILES[0].name, { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: COPY.select })).toHaveCount(0);
    await expect(page.getByRole("button", { name: COPY.clear })).toHaveCount(0);
  });
});
