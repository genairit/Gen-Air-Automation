import {
  seedCustomer,
  seedBuilding,
  buildCustomerInput,
  seedStandaloneProject,
} from "../../src/api/seed-data.ts";

import {
  buildImportRow,
  makeImportWorkbook,
} from "../../src/utilities/apartment-import.utility.ts";

import { test, expect } from "../../src/fixtures/test.fixture.ts";
import { createProjectPage } from "../../src/pages/project.page.ts";
import { FAKE_PLACES } from "../../src/constants/fake-places.constant.ts";
import { readLastPathSegment } from "../../src/utilities/route.utility.ts";
import { createUniqueName } from "../../src/utilities/test-data.utility.ts";
import { createProjectFormPage } from "../../src/pages/project-form.page.ts";
import { readBuildingApartments } from "../../src/api/apartment-import.api.ts";
import { ROUTE_PATTERNS } from "../../src/constants/route-patterns.constant.ts";
import { buildProjectDraftKey } from "../../src/utilities/auth-state.utility.ts";
import { HTTP_METHODS, HTTP_STATUS } from "../../src/constants/http.constant.ts";
import { readProjectConstraints } from "../../src/api/project-constraints.api.ts";
import { APARTMENT_IMPORT } from "../../src/constants/apartment-import.constant.ts";
import { createApartmentDesignPage } from "../../src/pages/apartment-design.page.ts";
import { createApartmentNumber } from "../../src/utilities/apartment-fixture.utility.ts";
import { PROJECT_CONSTRAINTS as COPY } from "../../src/constants/project-constraints.constant.ts";
import { PROJECT_TYPE_NAMES, PAYMENT_TERMS_LABELS } from "../../src/constants/domain.constant.ts";

test("lighting is keyboard accessible, validates height and persists decimal and disabled states", async ({
  page,
  api,
}, info) => {
  const customer = await seedCustomer(api);
  const form = createProjectFormPage(page);
  await form.goto();
  await form.fill({
    name: createUniqueName("תאורה"),
    place: FAKE_PLACES[1],
    customerName: customer.name,
    projectTypeName: PROJECT_TYPE_NAMES.COMMERCIAL,
    paymentTermsLabel: PAYMENT_TERMS_LABELS.MILESTONES_NET_60,
  });
  const toggle = page.getByRole("switch", { name: COPY.LIGHTING_LABEL });
  const height = page.getByPlaceholder(COPY.HEIGHT_PLACEHOLDER);
  await expect(toggle).toHaveAttribute("aria-checked", "false");
  await toggle.focus();
  await page.keyboard.press("Space");
  await expect(toggle).toHaveAttribute("aria-checked", "true");
  await form.createButton.click();
  await expect(page.getByText(COPY.HEIGHT_REQUIRED, { exact: true })).toBeVisible();
  await height.fill("abc");
  await expect(page.getByText(COPY.HEIGHT_INVALID, { exact: true })).toBeVisible();
  await height.fill("25.5");
  await expect(form.createButton).toBeEnabled();
  await page.screenshot({ path: info.outputPath("lighting-desktop.png"), fullPage: true });
  await form.createButton.click();
  await expect(page).toHaveURL(ROUTE_PATTERNS.PROJECT);
  const id = readLastPathSegment(page.url());
  expect(await readProjectConstraints(api, id)).toMatchObject({
    hasGeneralLightingCeilingLowering: true,
    generalLightingCeilingLoweringHeight: 25.5,
  });
  await form.gotoEdit(id);
  await expect(height).toHaveValue("25.5");
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(toggle).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  await page.screenshot({ path: info.outputPath("lighting-mobile.png"), fullPage: true });
  await toggle.click();
  await expect(height).toHaveCount(0);
  await form.saveButton.click();
  await expect(page).toHaveURL(ROUTE_PATTERNS.PROJECT);
  expect(await readProjectConstraints(api, id)).toMatchObject({
    hasGeneralLightingCeilingLowering: false,
    generalLightingCeilingLoweringHeight: null,
  });
});

test("taken names show inline feedback and failed availability requires retry", async ({
  page,
  api,
}) => {
  const customer = await seedCustomer(api);
  const project = await seedStandaloneProject(api, customer);
  const form = createProjectFormPage(page);
  await form.goto();
  await form.fill({
    name: project.name,
    place: FAKE_PLACES[1],
    customerName: customer.name,
    projectTypeName: PROJECT_TYPE_NAMES.COMMERCIAL,
    paymentTermsLabel: PAYMENT_TERMS_LABELS.MILESTONES_NET_60,
  });
  await expect(page.getByText(COPY.DUPLICATE_NAME, { exact: true })).toBeVisible();
  await expect(form.createButton).toBeDisabled();
  const availabilityState = { failed: true };
  await page.route("**/project/name-availability?**", async route => {
    if (availabilityState.failed) {
      await route.fulfill({
        status: HTTP_STATUS.SERVICE_UNAVAILABLE,
        json: { message: "Unavailable" },
      });
      return;
    }
    await route.continue();
  });
  await form.nameInput.fill(createUniqueName("בדיקה"));
  await expect(page.getByText(COPY.NAME_CHECK_FAILED, { exact: true })).toBeVisible();
  await expect(form.createButton).toBeDisabled();
  availabilityState.failed = false;
  await page.getByRole("button", { name: "נסה שוב", exact: true }).click();
  await expect(page.getByText(COPY.NAME_CHECK_FAILED, { exact: true })).toHaveCount(0);
  await expect(form.createButton).toBeEnabled();
});

test("a real concurrent name collision stays inline and clears after rename away and back", async ({
  page,
  api,
}) => {
  const customer = await seedCustomer(api);
  const project = await seedStandaloneProject(api, customer);
  const form = createProjectFormPage(page);
  const name = createUniqueName("תחרות");
  await form.gotoEdit(project.id);
  await form.nameInput.fill(name);
  await expect(form.saveButton).toBeEnabled();
  const race: { competitorId: string | null } = { competitorId: null };
  await page.route(`**/project/${project.id}`, async route => {
    if (route.request().method() === HTTP_METHODS.PATCH && !race.competitorId) {
      const competitor = await seedStandaloneProject(api, customer);
      await api.send(HTTP_METHODS.PATCH, `/project/${competitor.id}`, { name });
      race.competitorId = competitor.id;
    }
    await route.continue();
  });
  await form.saveButton.click();
  await expect(page.getByText(COPY.DUPLICATE_NAME, { exact: true })).toBeVisible();
  expect(race.competitorId).not.toBeNull();
  if (!race.competitorId) {
    throw new Error("Concurrent project was not created");
  }

  await api.send(HTTP_METHODS.DELETE, `/project/${race.competitorId}`);
  await form.nameInput.fill(createUniqueName("חלופי"));
  await expect(form.saveButton).toBeEnabled();
  await form.nameInput.fill(name);
  await expect(form.saveButton).toBeEnabled();
  await expect(page.getByText(COPY.DUPLICATE_NAME, { exact: true })).toHaveCount(0);
  await form.saveButton.click();
  await expect(page).toHaveURL(ROUTE_PATTERNS.PROJECT);
  expect((await readProjectConstraints(api, project.id)).name).toBe(name);
});

test("new lighting values restore with the project draft", async ({ page, api }) => {
  const form = createProjectFormPage(page);
  await form.goto();
  const name = createUniqueName("טיוטה תאורה");
  await form.nameInput.fill(name);
  const toggle = page.getByRole("switch", { name: COPY.LIGHTING_LABEL });
  const height = page.getByPlaceholder(COPY.HEIGHT_PLACEHOLDER);
  await toggle.click();
  await height.fill("0");
  await page.reload();
  await expect(form.nameInput).toHaveValue(name);
  await expect(toggle).toHaveAttribute("aria-checked", "true");
  await expect(height).toHaveValue("0");
  await page.evaluate(key => {
    const draft = JSON.parse(localStorage.getItem(key) ?? "{}");
    delete draft.values.hasGeneralLightingCeilingLowering;
    delete draft.values.generalLightingCeilingLoweringHeight;
    localStorage.setItem(key, JSON.stringify(draft));
  }, buildProjectDraftKey(api.session.user.id));
  await page.reload();
  await expect(form.nameInput).toHaveValue(name);
  await expect(toggle).toHaveAttribute("aria-checked", "false");
  await expect(height).toHaveCount(0);
});

test("apartments globally collide with standalone preflight and another building's creation and import", async ({
  page,
  api,
}) => {
  const owner = await seedCustomer(api);
  const building = await seedBuilding(api, owner);
  const other = await seedBuilding(api, owner);
  const number = createApartmentNumber();
  const apartment = await api.createApartment(building.id, {
    customerId: owner.id,
    customerFloor: 1,
    customerApartment: number,
  });
  const projectForm = createProjectFormPage(page);
  await projectForm.goto();
  await projectForm.nameInput.fill(apartment.name);
  await expect(page.getByText(COPY.DUPLICATE_NAME, { exact: true })).toBeVisible();
  const apartmentForm = createApartmentDesignPage(page);
  await apartmentForm.gotoCreate(other.id);
  await apartmentForm.fillUnit(number);
  await apartmentForm.pickCustomer(owner.name);
  await apartmentForm.submit.click();
  await expect(page.getByRole("alert").filter({ hasText: COPY.DUPLICATE_NAME })).toBeVisible();
  await createProjectPage(page).goto(other.id);
  await page.getByRole("button", { name: APARTMENT_IMPORT.OPEN, exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog.locator('input[type="file"]').setInputFiles({
    name: APARTMENT_IMPORT.FILE_NAME,
    mimeType: APARTMENT_IMPORT.MIME_TYPE,
    buffer: await makeImportWorkbook([buildImportRow(buildCustomerInput(), number)]),
  });
  await expect(
    dialog.getByText("קיים כבר פרויקט בשם הדירה במערכת; לא נשמרו שינויים משורה זו", {
      exact: true,
    }),
  ).toBeVisible();
  expect(await readBuildingApartments(api, other.id)).toHaveLength(0);
});

test("pending availability blocks submission until the real server answers", async ({
  page,
  api,
}) => {
  const form = createProjectFormPage(page);
  await form.goto();
  const customer = await seedCustomer(api);
  await form.fill({
    name: createUniqueName("בדיקת זמינות"),
    place: FAKE_PLACES[1],
    customerName: customer.name,
    projectTypeName: PROJECT_TYPE_NAMES.COMMERCIAL,
    paymentTermsLabel: PAYMENT_TERMS_LABELS.MILESTONES_NET_60,
  });
  await expect(form.createButton).toBeEnabled();
  const pending = { release: () => {} };
  const gate = new Promise<void>(resolve => {
    pending.release = resolve;
  });
  await page.route("**/project/name-availability?**", async route => {
    await gate;
    await route.continue();
  });
  try {
    await form.nameInput.fill(createUniqueName("בדיקה ממתינה"));
    await expect(page.getByText("בודק אם השם פנוי…", { exact: true })).toBeVisible();
    await expect(form.createButton).toBeDisabled();
  } finally {
    pending.release();
  }
  await expect(page.getByText("בודק אם השם פנוי…", { exact: true })).toHaveCount(0);
  await expect(form.createButton).toBeEnabled();
});
