import {
  seedTask,
  seedBuilding,
  seedCustomer,
  linkToProject,
  seedApartment,
  buildTaskInput,
  seedStandaloneProject,
} from "../../src/api/seed-data.ts";

import {
  JENNY_PDF,
  JENNY_REPLIES,
  JENNY_API_PATH,
  JENNY_QUESTION,
} from "../../src/constants/jenny.constant.ts";

import type { TGenAirApi } from "../../src/api/gen-air-api.ts";
import { isRecord } from "../../src/utilities/guard.utility.ts";
import { createJennyPage } from "../../src/pages/jenny.page.ts";
import { createBoardPage } from "../../src/pages/board.page.ts";
import { test, expect } from "../../src/fixtures/test.fixture.ts";
import { URLS } from "../../src/constants/environment.constant.ts";
import { TASK_STATUSES } from "../../src/constants/domain.constant.ts";
import { USER_ROLES } from "../../src/constants/user-role.constant.ts";
import { TEST_USERS } from "../../src/constants/test-users.constant.ts";
import { PERMISSIONS } from "../../src/constants/permission.constant.ts";
import { buildProjectRoute } from "../../src/utilities/route.utility.ts";
import { seedQuotationDesign } from "../../src/api/quotation-design-fixture.ts";
import { registerJennyPdf } from "../../src/environment/jenny-drive-fixture.ts";
import { withRolePermissions } from "../../src/environment/role-permissions.ts";
import { HTTP_METHODS, HTTP_STATUS } from "../../src/constants/http.constant.ts";
import { buildBrowserApiPattern } from "../../src/utilities/api-path.utility.ts";
import { setTaskSortFixtures } from "../../src/environment/task-sort-fixtures.ts";

const CURRENCY = new Intl.NumberFormat("he-IL", { style: "currency", currency: "ILS" });
const FINANCE = USER_ROLES.FINANCE;
const MOBILE_VIEWPORT = { width: 390, height: 844 };
const PROJECT_PDF = "מפרט יחידות מיזוג.pdf";
const APARTMENT_PDF = "תוכנית דירה מפורטת.pdf";
const ARCHIVED_PDF = "תוכנית דירה בארכיון.pdf";
const TASK_PAGE_LIMIT = 20;
const OVERDUE_TASK_DATE = "2000-01-01T00:00:00.000Z";

const chatRequest = (projectId: string, question: string) => ({
  context: { type: "project", id: projectId },
  messages: [{ role: "user", content: question }],
});

const provisionDrive = async (api: TGenAirApi, projectId: string): Promise<string> => {
  const response = await api.send(HTTP_METHODS.POST, `/project-drive/${projectId}/provision`);
  expect(response.status()).toBe(HTTP_STATUS.CREATED);
  const body: unknown = await response.json();
  if (!isRecord(body) || typeof body.driveFolderId !== "string") {
    throw new Error("Project Drive fixture did not return a folder ID");
  }

  return body.driveFolderId;
};

test("Jenny stays off the project board and answers on project details with actual quotation totals in RTL", async ({
  page,
  api,
}) => {
  const { project, quotation } = await seedQuotationDesign(api);
  const { stage } = await api.getProject(project.id);
  const board = createBoardPage(page);
  const jenny = createJennyPage(page);

  await board.goto();
  await expect(board.searchBox).toBeVisible();
  await expect(jenny.launcher).toHaveCount(0);
  await board.findRow(project.name).click();
  await expect(page).toHaveURL(buildProjectRoute(project.id));
  await expect(jenny.launcher).toBeVisible();
  await expect(jenny.launcher).toHaveCSS("position", "fixed");
  const launcherBox = await jenny.launcher.boundingBox();
  expect(launcherBox?.x).toBeLessThan(50);

  await jenny.launcher.click();
  await expect(jenny.dialog).toHaveAttribute("aria-modal", "false");
  await expect(jenny.dialog).toHaveCSS("direction", "rtl");
  await expect(jenny.greeting).toBeVisible();
  await expect(jenny.input).toBeFocused();
  await jenny.input.fill(JENNY_QUESTION.SUMMARY);
  await jenny.input.press("Enter");
  await expect(jenny.loading).toBeVisible();
  await expect(jenny.thread).toContainText(`השלב של ${project.name} הוא ${stage.name}`);
  await expect(jenny.thread).toContainText(`גרסה ${quotation.version}, מע״מ ${quotation.vatRate}%`);
  await expect(jenny.thread).toContainText(CURRENCY.format(Number(quotation.totals.pretax)));
  await expect(jenny.thread).toContainText(CURRENCY.format(Number(quotation.totals.total)));

  await jenny.input.press("Escape");
  await expect(jenny.dialog).toBeHidden();
  await expect(jenny.launcher).toBeFocused();
  await jenny.launcher.click();
  await expect(jenny.thread).toContainText(JENNY_QUESTION.SUMMARY);

  await page.reload();
  await jenny.launcher.click();
  await expect(jenny.greeting).toBeVisible();
  await expect(jenny.thread).not.toContainText(JENNY_QUESTION.SUMMARY);
});

test("Jenny lists and searches only the current project's Drive, citing the matching PDF page", async ({
  page,
  api,
}) => {
  const building = await seedBuilding(api, await seedCustomer(api));
  const apartment = await seedApartment(api, building);
  const archived = await seedApartment(api, building);
  const buildingRoot = await provisionDrive(api, building.id);
  const apartmentRoot = await provisionDrive(api, apartment.id);
  const archivedRoot = await provisionDrive(api, archived.id);
  const buildingPdf = await registerJennyPdf(buildingRoot, PROJECT_PDF);
  const apartmentPdf = await registerJennyPdf(apartmentRoot, APARTMENT_PDF);
  await registerJennyPdf(archivedRoot, ARCHIVED_PDF);
  const archivedResponse = await api.send(HTTP_METHODS.DELETE, `/project/${archived.id}`);
  expect(archivedResponse.status()).toBe(HTTP_STATUS.NO_CONTENT);
  const jenny = createJennyPage(page);

  await page.goto(buildProjectRoute(building.id));
  await jenny.launcher.click();
  await jenny.ask(JENNY_QUESTION.DOCUMENTS);
  await expect(jenny.thread).toContainText(`מצאתי קבצים: `);
  await expect(jenny.thread).toContainText(`לפי ${PROJECT_PDF}, עמוד 2`);
  const snippet = jenny.thread.locator("p").filter({ hasText: JENNY_PDF.EXPECTED_MATCH });
  await expect(snippet).toHaveAttribute("dir", "auto");
  await expect(snippet).toHaveCSS("direction", "ltr");
  const citation = jenny.thread.getByRole("link", { name: PROJECT_PDF });
  await expect(citation).toHaveAttribute(
    "href",
    `https://drive.google.com/open?id=${buildingPdf.id}`,
  );
  await expect(citation).toHaveAccessibleName(/עמוד 2/);
  await expect(citation).toHaveAttribute("target", "_blank");
  await expect(jenny.thread).not.toContainText(APARTMENT_PDF);
  await expect(jenny.thread).not.toContainText(ARCHIVED_PDF);
  await test.info().attach("jenny-desktop-citation", {
    body: await jenny.dialog.screenshot(),
    contentType: "image/png",
  });

  const apartmentAnswer = await api.send(
    HTTP_METHODS.POST,
    JENNY_API_PATH,
    chatRequest(apartment.id, JENNY_QUESTION.DOCUMENTS),
  );
  expect(apartmentAnswer.status()).toBe(HTTP_STATUS.OK);
  const apartResponse: unknown = await apartmentAnswer.json();
  expect(apartResponse).toMatchObject({
    message: expect.stringContaining(`לפי ${APARTMENT_PDF}, עמוד 2`),
    sources: expect.arrayContaining([
      expect.objectContaining({ fileId: apartmentPdf.id, fileName: APARTMENT_PDF, page: 2 }),
    ]),
  });
  expect(apartResponse).not.toMatchObject({ message: expect.stringContaining(PROJECT_PDF) });

  const other = await seedStandaloneProject(api, await seedCustomer(api));
  const board = createBoardPage(page);
  await page.getByRole("link", { name: /חזרה לתיקים/ }).click();
  await expect(board.searchBox).toBeVisible();
  await expect(jenny.launcher).toHaveCount(0);
  await board.findRow(other.name).click();
  await expect(page).toHaveURL(buildProjectRoute(other.id));
  await jenny.launcher.click();
  await expect(jenny.greeting).toBeVisible();
  await expect(jenny.thread).not.toContainText(JENNY_QUESTION.DOCUMENTS);
});

test("Jenny reads only the current project’s tasks and reports counts beyond the displayed page", async ({
  api,
  page,
  apiAs,
}) => {
  const assignee = (await apiAs(TEST_USERS[USER_ROLES.ENGINEER])).session.user;
  const project = await seedBuilding(api, await seedCustomer(api));
  const child = await seedApartment(api, project);
  const empty = await seedStandaloneProject(api, await seedCustomer(api));
  const assignedTask = await seedTask(api, {
    link: linkToProject(project),
    assigneeId: assignee.id,
  });
  const childTask = await seedTask(api, { link: linkToProject(child) });
  await setTaskSortFixtures([
    {
      ...assignedTask,
      isUrgent: false,
      dueDate: OVERDUE_TASK_DATE,
      assigneeId: assignee.id,
      status: TASK_STATUSES.IN_PROGRESS,
    },
  ]);
  const additionalTasks = Array.from({ length: TASK_PAGE_LIMIT }, () =>
    buildTaskInput({ link: linkToProject(project) }),
  );
  for (const task of additionalTasks) {
    await api.createTask({ ...task, dueDate: null });
  }

  const jenny = createJennyPage(page);
  await page.goto(buildProjectRoute(project.id));
  await jenny.launcher.click();
  await jenny.ask(JENNY_QUESTION.TASKS);
  await expect(jenny.thread).toContainText(
    `בתיק ${TASK_PAGE_LIMIT + 1} משימות, מתוכן 1 באיחור. מוצגות ${TASK_PAGE_LIMIT} משימות.`,
  );
  await expect(jenny.thread).toContainText(
    `${assignedTask.title} | ${TASK_STATUSES.IN_PROGRESS} | ${assignee.firstName} ${assignee.lastName} | ${OVERDUE_TASK_DATE.slice(0, 10)}`,
  );
  await expect(jenny.thread).toContainText(JENNY_REPLIES.MORE_TASKS);
  await expect(jenny.thread).not.toContainText(childTask.title);

  await page.goto(buildProjectRoute(empty.id));
  await jenny.launcher.click();
  await jenny.ask(JENNY_QUESTION.TASKS);
  await expect(jenny.thread).toContainText(JENNY_REPLIES.NO_TASKS);
});

test("Jenny exposes only the current permissions and requires project read", async ({
  api,
  apiAs,
  openPageAs,
  request,
}) => {
  const project = await seedStandaloneProject(api, await seedCustomer(api));
  const chat = chatRequest(project.id, JENNY_QUESTION.PERMISSIONS);
  const task = await seedTask(api, { link: linkToProject(project) });

  const actor = await apiAs(TEST_USERS[FINANCE]);
  const unauthenticated = await request.post(`${URLS.BACKEND}${JENNY_API_PATH}`, { data: chat });
  expect(unauthenticated.status()).toBe(HTTP_STATUS.UNAUTHORIZED);
  await withRolePermissions(FINANCE, [], async () => {
    const denied = await actor.send(HTTP_METHODS.POST, JENNY_API_PATH, chat);
    expect(denied.status()).toBe(HTTP_STATUS.FORBIDDEN);
  });

  await withRolePermissions(FINANCE, [PERMISSIONS.PROJECTS_READ], async () => {
    const restrictedPage = await openPageAs(TEST_USERS[FINANCE]);
    const jenny = createJennyPage(restrictedPage);
    await restrictedPage.goto(buildProjectRoute(project.id));
    await jenny.launcher.click();
    await jenny.ask(JENNY_QUESTION.PERMISSIONS);
    await expect(jenny.thread).toContainText(JENNY_REPLIES.LIMITED_ACCESS);
    await expect(jenny.thread).toContainText(project.name);
    await expect(jenny.thread.getByRole("link")).toHaveCount(0);

    await jenny.ask(JENNY_QUESTION.TASKS);
    await expect(jenny.thread).toContainText(JENNY_REPLIES.TASKS_NOT_AVAILABLE);
    await expect(jenny.thread).not.toContainText(task.title);
  });
});

test("Jenny opens a full-screen mobile sheet and retries a transient Hebrew error", async ({
  api,
  page,
}) => {
  const project = await seedStandaloneProject(api, await seedCustomer(api));
  const jenny = createJennyPage(page);
  await page.setViewportSize(MOBILE_VIEWPORT);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.route(
    buildBrowserApiPattern(JENNY_API_PATH),
    route => route.fulfill({ status: HTTP_STATUS.BAD_GATEWAY, json: {} }),
    { times: 1 },
  );

  await page.goto(buildProjectRoute(project.id));
  await jenny.launcher.click();
  await expect(jenny.dialog).toHaveAttribute("aria-modal", "true");
  await expect(jenny.dialog).toHaveCSS("width", `${MOBILE_VIEWPORT.width}px`);
  await expect(jenny.dialog).toHaveCSS("height", `${MOBILE_VIEWPORT.height}px`);
  await expect(jenny.input).toBeFocused();
  await jenny.ask(JENNY_QUESTION.SUMMARY);
  await expect(jenny.dialog.getByRole("alert")).toContainText("לא הצלחתי לקבל תשובה");
  await jenny.retry.click();
  await expect(jenny.thread).toContainText(JENNY_REPLIES.NO_QUOTATION);
  await test.info().attach("jenny-mobile-answer", {
    body: await jenny.dialog.screenshot(),
    contentType: "image/png",
  });
  await expect(jenny.input).toBeFocused();
  await jenny.input.press("Escape");
  await expect(jenny.dialog).toBeHidden();
  await expect(jenny.launcher).toBeFocused();
});
