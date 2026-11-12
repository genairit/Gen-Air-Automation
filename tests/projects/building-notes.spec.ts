import { test, expect } from "../../src/fixtures/test.fixture.ts";
import { createProjectPage } from "../../src/pages/project.page.ts";
import { findCardByTitle } from "../../src/pages/card.component.ts";
import { USER_ROLES } from "../../src/constants/user-role.constant.ts";
import { createApartmentPage } from "../../src/pages/apartment.page.ts";
import { TEST_USERS } from "../../src/constants/test-users.constant.ts";
import { FAKE_PLACES } from "../../src/constants/fake-places.constant.ts";
import { BUILDING_NOTES_COPY } from "../../src/constants/copy.constant.ts";
import { buildProjectPath } from "../../src/utilities/api-path.utility.ts";
import { PROJECT_TYPE_NAMES } from "../../src/constants/domain.constant.ts";
import { createUniqueName } from "../../src/utilities/test-data.utility.ts";
import { createProjectFormPage } from "../../src/pages/project-form.page.ts";
import { ROUTE_PATTERNS } from "../../src/constants/route-patterns.constant.ts";
import { HTTP_METHODS, HTTP_STATUS } from "../../src/constants/http.constant.ts";
import { seedBuilding, seedCustomer, seedApartment } from "../../src/api/seed-data.ts";
import { buildEditProjectRoute, readLastPathSegment } from "../../src/utilities/route.utility.ts";

const INITIAL_NOTES = "תמ״א 38\nגישה דרך חדר המדרגות המזרחי";
const APARTMENT_NOTES = "הדייר זמין בבוקר";
const UPDATED_NOTES = "הנחיית בניין מעודכנת\nעבודה בתיאום עם ועד הבית";
const LONG_NOTES = Array.from({ length: 110 }, () => "הנחיות עבודה לכל הדירות").join(" ");

test("building notes save on creation, update live in apartments, and leave apartment notes separate", async ({
  page,
  api,
}, testInfo) => {
  const customer = await seedCustomer(api);
  const form = createProjectFormPage(page);
  await form.goto();
  await expect(form.notesInput).toHaveCount(0);
  await form.fill({
    name: createUniqueName("בניין עם הערות"),
    place: FAKE_PLACES[1],
    customerName: customer.name,
    projectTypeName: PROJECT_TYPE_NAMES.RESIDENTIAL_BUILDING,
  });
  await expect(form.notesInput).toBeVisible();
  await expect(form.notesInput).toHaveAttribute("dir", "rtl");
  await form.notesInput.fill(INITIAL_NOTES);
  await form.createButton.click();
  await expect(page).toHaveURL(ROUTE_PATTERNS.PROJECT);
  const buildingId = readLastPathSegment(page.url());
  const projectPage = createProjectPage(page);
  await expect(page.getByText(INITIAL_NOTES, { exact: true })).toBeVisible();
  await expect(page.getByText(BUILDING_NOTES_COPY.TAMA_BADGE, { exact: true })).toBeVisible();
  expect(
    await (await api.send(HTTP_METHODS.GET, buildProjectPath(buildingId))).json(),
  ).toMatchObject({
    notes: INITIAL_NOTES,
  });

  const apartment = await seedApartment(api, await api.getProject(buildingId));
  const apartmentPage = createApartmentPage(page);
  await apartmentPage.goto(buildingId, apartment.id);
  const inherited = findCardByTitle(page, BUILDING_NOTES_COPY.PARENT_CARD);
  const local = findCardByTitle(page, BUILDING_NOTES_COPY.APARTMENT_CARD);
  await expect(inherited.getByText(INITIAL_NOTES, { exact: true })).toBeVisible();
  await expect(inherited.getByText(BUILDING_NOTES_COPY.INHERITED_BADGE)).toBeVisible();
  await expect(local.getByRole("textbox")).toHaveValue("");
  await apartmentPage.notesInput.fill(APARTMENT_NOTES);
  await apartmentPage.saveNotesButton.click();
  await expect(apartmentPage.saveNotesButton).toBeDisabled();

  await form.gotoEdit(buildingId);
  await expect(form.notesInput).toHaveValue(INITIAL_NOTES);
  await form.notesInput.fill(UPDATED_NOTES);
  await form.saveButton.click();
  await expect(page).toHaveURL(ROUTE_PATTERNS.PROJECT);
  await expect(projectPage.heading((await api.getProject(buildingId)).name)).toBeVisible();
  await expect(page.getByText(UPDATED_NOTES, { exact: true })).toBeVisible();
  await apartmentPage.goto(buildingId, apartment.id);
  await page.reload();
  await expect(inherited.getByText(UPDATED_NOTES, { exact: true })).toBeVisible();
  await expect(local.getByRole("textbox")).toHaveValue(APARTMENT_NOTES);
  expect(
    await (await api.send(HTTP_METHODS.GET, buildProjectPath(apartment.id))).json(),
  ).toMatchObject({
    notes: APARTMENT_NOTES,
    parentNotes: UPDATED_NOTES,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(inherited.getByText(UPDATED_NOTES, { exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  await page.screenshot({
    path: testInfo.outputPath("building-notes-apartment-mobile.png"),
    fullPage: true,
  });
});

test("long building notes and clearing them render consistently without granting edit access", async ({
  page,
  api,
  apiAs,
  openPageAs,
}) => {
  const building = await seedBuilding(api, await seedCustomer(api));
  const apartment = await seedApartment(api, building);
  const form = createProjectFormPage(page);
  await form.gotoEdit(building.id);
  await expect(form.notesInput).toHaveValue("");
  await form.notesInput.fill(LONG_NOTES);
  await form.saveButton.click();
  await expect(page.getByText(LONG_NOTES, { exact: true })).toBeVisible();
  await createApartmentPage(page).goto(building.id, apartment.id);
  await page.reload();
  await expect(
    findCardByTitle(page, BUILDING_NOTES_COPY.PARENT_CARD).getByText(LONG_NOTES, { exact: true }),
  ).toBeVisible();

  const engineerPage = await openPageAs(TEST_USERS[USER_ROLES.ENGINEER]);
  await engineerPage.goto(buildEditProjectRoute(building.id));
  await expect(createProjectFormPage(engineerPage).editDenied).toBeVisible();
  await expect(createProjectFormPage(engineerPage).notesInput).toHaveCount(0);
  const engineerApi = await apiAs(TEST_USERS[USER_ROLES.ENGINEER]);
  const denied = await engineerApi.send(HTTP_METHODS.PATCH, buildProjectPath(building.id), {
    notes: "unauthorized",
  });
  expect(denied.status()).toBe(HTTP_STATUS.FORBIDDEN);

  await form.gotoEdit(building.id);
  await form.notesInput.fill("");
  await form.saveButton.click();
  await expect(page.getByText(BUILDING_NOTES_COPY.NO_NOTES, { exact: true })).toBeVisible();
  expect(
    await (await api.send(HTTP_METHODS.GET, buildProjectPath(building.id))).json(),
  ).toMatchObject({
    notes: null,
  });
  await createApartmentPage(page).goto(building.id, apartment.id);
  await expect(
    findCardByTitle(page, BUILDING_NOTES_COPY.PARENT_CARD).getByText(BUILDING_NOTES_COPY.NO_NOTES),
  ).toBeVisible();
});
