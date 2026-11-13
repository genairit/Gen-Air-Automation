import {
  moveWithReason,
  readTransitionNotes,
  readWaitingReasonProject,
  buildProjectTransitionsPath,
} from "../../src/api/stage-reason.api.ts";

import {
  buildProjectStagePath,
  buildBrowserApiPattern,
} from "../../src/utilities/api-path.utility.ts";

import {
  findTimelineReason,
  createStageReasonDialog,
  findWaitingReasonBanner,
} from "../../src/pages/stage-reason.component.ts";

import {
  STAGE_REASON_COPY,
  PROJECT_STATUS_IDS,
  WAITING_REASON_ERROR,
  STAGE_NOTE_MAX_LENGTH,
  formatBulkReasonTitle,
  formatCharacterCounter,
  formatBulkReasonContext,
  PROJECT_EDIT_STATUS_LABEL,
  ARCHIVED_ON_HOLD_STAGE_NAME,
} from "../../src/constants/stage-reason.constant.ts";

import type { TGenAirApi } from "../../src/api/gen-air-api.ts";
import type { Page, Request, Locator } from "@playwright/test";
import { test, expect } from "../../src/fixtures/test.fixture.ts";
import { selectOption } from "../../src/pages/select.component.ts";
import { HTTP_STATUS } from "../../src/constants/http.constant.ts";
import { createProjectPage } from "../../src/pages/project.page.ts";
import { VIEWPORTS } from "../../src/constants/viewport.constant.ts";
import { expectTabSelected } from "../../src/pages/tab.component.ts";
import { findFieldContainer } from "../../src/pages/field.component.ts";
import { createApartmentPage } from "../../src/pages/apartment.page.ts";
import { KEYBOARD_KEYS } from "../../src/constants/keyboard.constant.ts";
import { createProjectFormPage } from "../../src/pages/project-form.page.ts";
import { PROJECT_STATUS_NAMES } from "../../src/constants/domain.constant.ts";
import { remapArchivedOnHoldProject } from "../../src/environment/stage-reason-data.ts";
import { createApartmentNumber } from "../../src/utilities/apartment-fixture.utility.ts";
import { seedBuilding, seedCustomer, seedStandaloneProject } from "../../src/api/seed-data.ts";

const REASON = "ממתינים לאישור התוכנית מהאדריכל";
const MIXED_REASON = "Waiting for ABC-123 approval מהלקוח";
const APARTMENT_REASON = "ממתינים לבחירת מזגנים מהדייר";
const BULK_REASON = "ממתינים לתשובת ועד הבית";
const EDIT_REASON = "ממתינים לחתימה על הצעת המחיר";
const STAGE_PATCH = "PATCH";
const PROJECT_PATCH_PATTERN = /\/api\/project\/[^/]+$/;

const captureStageMoves = (page: Page): Request[] => {
  const requests: Request[] = [];
  page.on("request", request => {
    const isStageMove = request.method() === STAGE_PATCH && request.url().endsWith("/stage");
    if (isStageMove) {
      requests.push(request);
    }
  });

  return requests;
};

const saveScreenshot = async (target: Page | Locator, name: string) => {
  const path = test.info().outputPath(`${name}.png`);
  await target.screenshot({ path });
  await test.info().attach(name, { path, contentType: "image/png" });
};

const expectNoHorizontalOverflow = async (page: Page) =>
  expect
    .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
    .toBe(true);

const seedApartmentWithNumber = async (api: TGenAirApi, buildingId: string) => {
  const number = createApartmentNumber();
  const customer = await seedCustomer(api);
  const apartment = await api.createApartment(buildingId, {
    customerId: customer.id,
    customerFloor: 1,
    customerApartment: number,
  });

  return { ...apartment, number };
};

const expectStage = async (api: TGenAirApi, projectId: string, stageName: string) =>
  expect.poll(async () => (await api.getProject(projectId)).stage.name).toBe(stageName);

test("the project header asks for a required reason and cancel, Esc and X send nothing", async ({
  page,
  api,
}) => {
  const project = await seedStandaloneProject(api, await seedCustomer(api));
  const projectPage = createProjectPage(page);
  const reasonDialog = createStageReasonDialog(page);
  const stageMoves = captureStageMoves(page);
  const closeActions = [
    () => reasonDialog.cancelButton.click(),
    () => page.keyboard.press(KEYBOARD_KEYS.ESCAPE),
    () => reasonDialog.closeButton.click(),
  ];

  await page.setViewportSize({ width: 1440, height: 900 });
  await projectPage.goto(project.id);
  await expect(findWaitingReasonBanner(page)).toHaveCount(0);

  for (const close of closeActions) {
    await projectPage.changeStage(PROJECT_STATUS_NAMES.WAITING_RESPONSE);
    await expect(reasonDialog.dialog).toBeVisible();
    await expect(reasonDialog.reasonInput).toHaveValue("");
    await reasonDialog.reasonInput.fill("טיוטה שלא תישלח");
    await close();
    await expect(reasonDialog.dialog).toBeHidden();
    await expect(projectPage.stagePicker).toHaveValue(PROJECT_STATUS_NAMES.NOT_STARTED);
  }
  expect(stageMoves).toHaveLength(0);
  await expectStage(api, project.id, PROJECT_STATUS_NAMES.NOT_STARTED);

  await projectPage.changeStage(PROJECT_STATUS_NAMES.WAITING_RESPONSE);
  await expect(reasonDialog.dialog).toContainText(STAGE_REASON_COPY.PROJECT_CONTEXT);
  await expect(reasonDialog.reasonInput).toBeFocused();
  await expect(reasonDialog.confirmButton).toBeDisabled();
  await expect(reasonDialog.counter(formatCharacterCounter(0))).toBeVisible();
  await reasonDialog.reasonInput.fill("   ");
  await expect(reasonDialog.confirmButton).toBeDisabled();
  await expect(reasonDialog.requiredError).toBeVisible();
  await reasonDialog.reasonInput.fill("ה".repeat(STAGE_NOTE_MAX_LENGTH + 40));
  await expect(reasonDialog.reasonInput).toHaveValue("ה".repeat(STAGE_NOTE_MAX_LENGTH));
  await expect(reasonDialog.counter(formatCharacterCounter(STAGE_NOTE_MAX_LENGTH))).toBeVisible();
  await reasonDialog.reasonInput.fill(`  ${MIXED_REASON}  `);
  await expect(reasonDialog.confirmButton).toBeEnabled();
  await saveScreenshot(page, "dialog-project-desktop");

  await reasonDialog.confirmButton.click();
  await expect(reasonDialog.dialog).toBeHidden();
  expect(stageMoves).toHaveLength(1);
  expect(stageMoves[0].postDataJSON()).toEqual({
    stageId: PROJECT_STATUS_IDS.WAITING_RESPONSE,
    note: MIXED_REASON,
  });
  await expect(projectPage.stagePicker).toHaveValue(PROJECT_STATUS_NAMES.WAITING_RESPONSE);
  const banner = findWaitingReasonBanner(page);
  await expect(banner).toContainText(MIXED_REASON);
  await expect(findTimelineReason(projectPage.timeline, MIXED_REASON)).toBeVisible();
  await expect(
    findTimelineReason(projectPage.timeline, MIXED_REASON).getByText(
      PROJECT_STATUS_NAMES.WAITING_RESPONSE,
    ),
  ).toBeVisible();
  await saveScreenshot(banner, "banner-project-desktop");
  await saveScreenshot(projectPage.timeline, "timeline-project-desktop");
  expect((await readWaitingReasonProject(api, project.id)).waitingReason).toBe(MIXED_REASON);
});

test("a server error keeps the reason dialog open with its message until a retry succeeds", async ({
  page,
  api,
}) => {
  const project = await seedStandaloneProject(api, await seedCustomer(api));
  const projectPage = createProjectPage(page);
  const reasonDialog = createStageReasonDialog(page);
  const stagePattern = buildBrowserApiPattern(buildProjectStagePath(project.id));

  await page.route(stagePattern, route =>
    route.fulfill({
      status: HTTP_STATUS.BAD_REQUEST,
      json: { code: WAITING_REASON_ERROR.CODE, message: WAITING_REASON_ERROR.MESSAGE },
    }),
  );
  await projectPage.goto(project.id);
  await projectPage.changeStage(PROJECT_STATUS_NAMES.WAITING_RESPONSE);
  await reasonDialog.confirm(REASON);

  await expect(reasonDialog.dialog).toContainText(WAITING_REASON_ERROR.MESSAGE);
  await expect(reasonDialog.reasonInput).toHaveValue(REASON);
  await expect(reasonDialog.confirmButton).toBeEnabled();
  await expectStage(api, project.id, PROJECT_STATUS_NAMES.NOT_STARTED);
  await saveScreenshot(reasonDialog.dialog, "dialog-server-error-desktop");

  await page.unroute(stagePattern);
  await reasonDialog.confirmButton.click();
  await expect(reasonDialog.dialog).toBeHidden();
  await expect(findWaitingReasonBanner(page)).toContainText(REASON);
  await expectStage(api, project.id, PROJECT_STATUS_NAMES.WAITING_RESPONSE);
});

test("other statuses move from the header without a reason prompt", async ({ page, api }) => {
  const project = await seedStandaloneProject(api, await seedCustomer(api));
  const projectPage = createProjectPage(page);
  const reasonDialog = createStageReasonDialog(page);
  const stageMoves = captureStageMoves(page);

  await projectPage.goto(project.id);
  for (const stageName of [PROJECT_STATUS_NAMES.IN_PROGRESS, PROJECT_STATUS_NAMES.COMPLETED]) {
    await projectPage.changeStage(stageName);
    await expect(projectPage.stagePicker).toHaveValue(stageName);
    await expect(reasonDialog.dialog).toHaveCount(0);
    await expectStage(api, project.id, stageName);
  }
  expect(stageMoves.map(request => request.postDataJSON())).toEqual([
    expect.not.objectContaining({ note: expect.anything() }),
    expect.not.objectContaining({ note: expect.anything() }),
  ]);
  await expect(findWaitingReasonBanner(page)).toHaveCount(0);
});

test("the building header shows its reason and bulk moves share one reason, keeping the selection until success", async ({
  page,
  api,
}) => {
  const building = await seedBuilding(api, await seedCustomer(api));
  const first = await seedApartmentWithNumber(api, building.id);
  const second = await seedApartmentWithNumber(api, building.id);
  const untouched = await seedApartmentWithNumber(api, building.id);
  const projectPage = createProjectPage(page);
  const headerDialog = createStageReasonDialog(page);
  const bulkDialog = createStageReasonDialog(page, formatBulkReasonTitle(2));
  const stageMoves = captureStageMoves(page);

  await projectPage.goto(building.id);
  await projectPage.changeStage(PROJECT_STATUS_NAMES.WAITING_RESPONSE);
  await headerDialog.confirm(REASON);
  await expect(headerDialog.dialog).toBeHidden();
  await expect(findWaitingReasonBanner(page)).toContainText(REASON);
  await saveScreenshot(findWaitingReasonBanner(page), "banner-building-desktop");

  await projectPage.selectApartment(first.number).check();
  await projectPage.selectApartment(second.number).check();
  await expect(projectPage.selectionCaption(2)).toBeVisible();
  const movesBeforeBulk = stageMoves.length;

  await projectPage.changeSelectedStageByKeyboard(PROJECT_STATUS_NAMES.WAITING_RESPONSE);
  await expect(bulkDialog.dialog).toContainText(formatBulkReasonContext(2));
  await bulkDialog.cancelButton.click();
  await expect(bulkDialog.dialog).toBeHidden();
  await expect(projectPage.selectionCaption(2)).toBeVisible();
  expect(stageMoves).toHaveLength(movesBeforeBulk);

  const secondPattern = buildBrowserApiPattern(buildProjectStagePath(second.id));
  await page.route(secondPattern, route =>
    route.fulfill({ status: HTTP_STATUS.INTERNAL_SERVER_ERROR, json: { message: "תקלה זמנית" } }),
  );
  await projectPage.changeSelectedStageByKeyboard(PROJECT_STATUS_NAMES.WAITING_RESPONSE);
  await bulkDialog.confirm(BULK_REASON);
  await expect(bulkDialog.dialog).toContainText("תקלה זמנית");
  await expect(projectPage.selectionCaption(2)).toBeVisible();
  await saveScreenshot(bulkDialog.dialog, "dialog-bulk-error-desktop");

  await page.unroute(secondPattern);
  await bulkDialog.confirmButton.click();
  await expect(bulkDialog.dialog).toBeHidden();
  await expect(projectPage.selectionCaption(2)).toHaveCount(0);

  const bulkBodies = stageMoves.slice(movesBeforeBulk).map(request => request.postDataJSON());
  expect(bulkBodies.length).toBeGreaterThanOrEqual(4);
  for (const body of bulkBodies) {
    expect(body).toEqual({ stageId: PROJECT_STATUS_IDS.WAITING_RESPONSE, note: BULK_REASON });
  }
  for (const apartment of [first, second]) {
    expect(await readWaitingReasonProject(api, apartment.id)).toMatchObject({
      stageId: PROJECT_STATUS_IDS.WAITING_RESPONSE,
      waitingReason: BULK_REASON,
    });
    const notes = await readTransitionNotes(api, apartment.id);
    expect(notes.filter(note => note.note === BULK_REASON)).toHaveLength(1);
  }
  expect((await readWaitingReasonProject(api, untouched.id)).waitingReason).toBeNull();
  expect((await readWaitingReasonProject(api, building.id)).waitingReason).toBe(REASON);
});

test("apartment status tabs ask for the reason by click and arrow key, and cancel restores focus", async ({
  page,
  api,
}) => {
  const building = await seedBuilding(api, await seedCustomer(api));
  const apartment = await seedApartmentWithNumber(api, building.id);
  const inProgress = await api.findProjectStage(PROJECT_STATUS_NAMES.IN_PROGRESS);
  await moveWithReason(api, apartment.id, { stageId: inProgress.id });
  const apartmentPage = createApartmentPage(page);
  const projectPage = createProjectPage(page);
  const reasonDialog = createStageReasonDialog(page);
  const stageMoves = captureStageMoves(page);
  const activeTab = apartmentPage.stageTab(PROJECT_STATUS_NAMES.IN_PROGRESS);

  await apartmentPage.goto(building.id, apartment.id);
  await expectTabSelected(activeTab);
  await apartmentPage.stageTab(PROJECT_STATUS_NAMES.WAITING_RESPONSE).click();
  await expect(reasonDialog.dialog).toContainText(STAGE_REASON_COPY.APARTMENT_CONTEXT);
  await reasonDialog.cancelButton.click();
  await expect(reasonDialog.dialog).toBeHidden();
  await expectTabSelected(activeTab);
  await expect(activeTab).toBeFocused();

  await page.keyboard.press(KEYBOARD_KEYS.ARROW_LEFT);
  await expect(reasonDialog.dialog).toBeVisible();
  expect(stageMoves).toHaveLength(0);
  await page.keyboard.press(KEYBOARD_KEYS.ESCAPE);
  await expect(reasonDialog.dialog).toBeHidden();
  await expect(activeTab).toBeFocused();
  await expectTabSelected(activeTab);
  expect(stageMoves).toHaveLength(0);

  await page.keyboard.press(KEYBOARD_KEYS.ARROW_LEFT);
  await reasonDialog.reasonInput.fill(APARTMENT_REASON);
  await reasonDialog.confirmButton.click();
  await expect(reasonDialog.dialog).toBeHidden();
  await expectTabSelected(apartmentPage.stageTab(PROJECT_STATUS_NAMES.WAITING_RESPONSE));
  expect(stageMoves.map(request => request.postDataJSON())).toEqual([
    { stageId: PROJECT_STATUS_IDS.WAITING_RESPONSE, note: APARTMENT_REASON },
  ]);
  const banner = findWaitingReasonBanner(page);
  await expect(banner).toContainText(APARTMENT_REASON);
  await expect(findTimelineReason(projectPage.timeline, APARTMENT_REASON)).toBeVisible();
  await saveScreenshot(banner, "banner-apartment-desktop");
  await saveScreenshot(projectPage.timeline, "timeline-apartment-desktop");

  await apartmentPage.stageTab(PROJECT_STATUS_NAMES.COMPLETED).click();
  await expect(reasonDialog.dialog).toHaveCount(0);
  await expectTabSelected(apartmentPage.stageTab(PROJECT_STATUS_NAMES.COMPLETED));
  await expect(banner).toHaveCount(0);
  await expectStage(api, apartment.id, PROJECT_STATUS_NAMES.COMPLETED);
});

test("the edit form requires an inline reason only when changing into waiting and sends stageNote", async ({
  page,
  api,
}) => {
  const project = await seedStandaloneProject(api, await seedCustomer(api));
  const formPage = createProjectFormPage(page);
  const statusPicker = page.getByRole("combobox", { name: PROJECT_EDIT_STATUS_LABEL });
  const reasonField = page.getByRole("textbox", { name: STAGE_REASON_COPY.LABEL });
  const requiredError = page.getByText(STAGE_REASON_COPY.REQUIRED_ERROR, { exact: true });
  const projectUpdates: Request[] = [];
  page.on("request", request => {
    if (request.method() === STAGE_PATCH && PROJECT_PATCH_PATTERN.test(request.url())) {
      projectUpdates.push(request);
    }
  });

  await formPage.gotoEdit(project.id);
  await expect(reasonField).toHaveCount(0);
  await selectOption(page, statusPicker, PROJECT_STATUS_NAMES.WAITING_RESPONSE);
  await expect(reasonField).toBeVisible();
  await selectOption(page, statusPicker, PROJECT_STATUS_NAMES.IN_PROGRESS);
  await expect(reasonField).toHaveCount(0);
  await selectOption(page, statusPicker, PROJECT_STATUS_NAMES.WAITING_RESPONSE);
  await formPage.saveButton.click();
  await expect(requiredError).toBeVisible();
  expect(projectUpdates).toHaveLength(0);
  await expectStage(api, project.id, PROJECT_STATUS_NAMES.NOT_STARTED);
  await saveScreenshot(
    findFieldContainer(page, STAGE_REASON_COPY.LABEL),
    "edit-form-reason-desktop",
  );

  await reasonField.fill(`  ${EDIT_REASON} `);
  await formPage.saveButton.click();
  await expect(page).toHaveURL(new RegExp(`/projects/${project.id}$`));
  expect(projectUpdates).toHaveLength(1);
  expect(projectUpdates[0].postDataJSON()).toMatchObject({
    stageId: PROJECT_STATUS_IDS.WAITING_RESPONSE,
    stageNote: EDIT_REASON,
  });
  await expect(findWaitingReasonBanner(page)).toContainText(EDIT_REASON);

  await formPage.gotoEdit(project.id);
  await expect(statusPicker).toHaveValue(PROJECT_STATUS_NAMES.WAITING_RESPONSE);
  await expect(reasonField).toHaveCount(0);
});

test("migrated waiting projects show the archived reason, an empty-reason banner and archived timeline labels", async ({
  page,
  api,
}) => {
  const archived = await seedStandaloneProject(api, await seedCustomer(api));
  const empty = await seedStandaloneProject(api, await seedCustomer(api));
  const archivedReason = "ממתין מהמערכת הקודמת";
  await remapArchivedOnHoldProject({
    projectId: archived.id,
    note: archivedReason,
    changedById: api.session.user.id,
  });
  await remapArchivedOnHoldProject({
    note: null,
    projectId: empty.id,
    changedById: api.session.user.id,
  });
  const projectPage = createProjectPage(page);

  await projectPage.goto(archived.id);
  await expect(findWaitingReasonBanner(page)).toContainText(archivedReason);
  const archivedEntry = findTimelineReason(projectPage.timeline, archivedReason);
  await expect(archivedEntry.getByText(ARCHIVED_ON_HOLD_STAGE_NAME, { exact: true })).toBeVisible();

  await projectPage.goto(empty.id);
  await expect(findWaitingReasonBanner(page)).toContainText(STAGE_REASON_COPY.BANNER_EMPTY);
  await saveScreenshot(findWaitingReasonBanner(page), "banner-empty-desktop");

  // The real API always joins archived stages; drop it in the browser to prove the fallback label.
  const transitionsPattern = buildBrowserApiPattern(buildProjectTransitionsPath(archived.id));
  await page.route(transitionsPattern, async route => {
    const response = await route.fetch();
    const transitions: Record<string, unknown>[] = await response.json();
    await route.fulfill({
      response,
      json: transitions.map(transition =>
        transition.toStageId === PROJECT_STATUS_IDS.ARCHIVED_ON_HOLD
          ? { ...transition, toStage: null }
          : transition,
      ),
    });
  });
  await projectPage.goto(archived.id);
  await expect(
    findTimelineReason(projectPage.timeline, archivedReason).getByText(
      STAGE_REASON_COPY.ARCHIVED_STAGE,
      { exact: true },
    ),
  ).toBeVisible();
  await saveScreenshot(projectPage.timeline, "timeline-archived-stage-desktop");
});

test("the dialog, banners and timeline fit a 390px screen in RTL", async ({ page, api }) => {
  const building = await seedBuilding(api, await seedCustomer(api));
  const apartment = await seedApartmentWithNumber(api, building.id);
  const longReason = `${"ממתיניםלאישורהאדריכל".repeat(12)}`.slice(0, STAGE_NOTE_MAX_LENGTH);
  const projectPage = createProjectPage(page);
  const apartmentPage = createApartmentPage(page);
  const reasonDialog = createStageReasonDialog(page);

  await page.setViewportSize(VIEWPORTS.MOBILE);
  await projectPage.goto(building.id);
  await projectPage.changeStage(PROJECT_STATUS_NAMES.WAITING_RESPONSE);
  await reasonDialog.reasonInput.fill(longReason);
  expect(await reasonDialog.dialog.evaluate(element => getComputedStyle(element).direction)).toBe(
    "rtl",
  );
  await expectNoHorizontalOverflow(page);
  await saveScreenshot(page, "dialog-building-390");
  await reasonDialog.confirmButton.click();
  await expect(reasonDialog.dialog).toBeHidden();
  const banner = findWaitingReasonBanner(page);
  await expect(banner).toContainText(longReason);
  await expectNoHorizontalOverflow(page);
  await saveScreenshot(banner, "banner-building-390");
  await projectPage.timeline.scrollIntoViewIfNeeded();
  await expect(findTimelineReason(projectPage.timeline, longReason)).toBeVisible();
  await expectNoHorizontalOverflow(page);
  await saveScreenshot(projectPage.timeline, "timeline-building-390");

  await apartmentPage.goto(building.id, apartment.id);
  await apartmentPage.stageTab(PROJECT_STATUS_NAMES.WAITING_RESPONSE).click();
  await expectNoHorizontalOverflow(page);
  await saveScreenshot(page, "dialog-apartment-390");
  await reasonDialog.confirm(MIXED_REASON);
  await expect(reasonDialog.dialog).toBeHidden();
  await expect(findWaitingReasonBanner(page)).toContainText(MIXED_REASON);
  await expectNoHorizontalOverflow(page);
  await saveScreenshot(findWaitingReasonBanner(page), "banner-apartment-390");
  await projectPage.timeline.scrollIntoViewIfNeeded();
  await saveScreenshot(projectPage.timeline, "timeline-apartment-390");
});

test("bulk stage options can be clicked above the apartments table header", async ({
  page,
  api,
}) => {
  const building = await seedBuilding(api, await seedCustomer(api));
  const apartment = await seedApartmentWithNumber(api, building.id);
  const projectPage = createProjectPage(page);
  const bulkDialog = createStageReasonDialog(page, formatBulkReasonTitle(1));

  await projectPage.goto(building.id);
  await projectPage.selectApartment(apartment.number).check();
  await projectPage.changeSelectedStage(PROJECT_STATUS_NAMES.WAITING_RESPONSE);
  await expect(bulkDialog.dialog).toBeVisible();
});
