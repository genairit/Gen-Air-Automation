import {
  buildProjectRoute,
  buildApartmentRoute,
  readLastPathSegment,
} from "../../src/utilities/route.utility.ts";

import {
  readDriveContents,
  readResponseRecord,
  createLinkedProjectInput,
} from "../../src/api/existing-drive-folder.api.ts";

import {
  newDriveRadio,
  existingDriveRadio,
  existingDriveFolderField,
} from "../../src/pages/existing-drive-folder.page.ts";

import type { Request } from "@playwright/test";
import { seedCustomer } from "../../src/api/seed-data.ts";
import { isRecord } from "../../src/utilities/guard.utility.ts";
import { test, expect } from "../../src/fixtures/test.fixture.ts";
import { HTTP_METHODS } from "../../src/constants/http.constant.ts";
import { createDeferred } from "../../src/utilities/deferred.utility.ts";
import { FAKE_PLACES } from "../../src/constants/fake-places.constant.ts";
import { PROJECT_TYPE_NAMES } from "../../src/constants/domain.constant.ts";
import { createUniqueName } from "../../src/utilities/test-data.utility.ts";
import { createApartmentFormPage } from "../../src/pages/apartment.page.ts";
import { createProjectFormPage } from "../../src/pages/project-form.page.ts";
import { legacyDriveTree } from "../../src/environment/existing-drive-fixtures.ts";
import { createApartmentNumber } from "../../src/utilities/apartment-fixture.utility.ts";
import { EXISTING_DRIVE_COPY } from "../../src/constants/existing-drive-folder.constant.ts";
import { EXISTING_DRIVE_ERROR_CODES } from "../../src/constants/existing-drive-folder.constant.ts";

const hasDriveReference = (request: Request, reference: string): boolean => {
  const input: unknown = request.postDataJSON();
  return isRecord(input) && input.reference === reference;
};

test("project creation previews and links an existing folder using keyboard radio controls; completion remains explicit", async ({
  page,
  api,
}) => {
  const legacy = await legacyDriveTree();
  const customer = await seedCustomer(api);
  const form = createProjectFormPage(page);
  await form.goto();
  await form.fill({
    name: createUniqueName("פרויקט קיים"),
    place: FAKE_PLACES[1],
    customerName: customer.name,
    projectTypeName: PROJECT_TYPE_NAMES.COMMERCIAL,
  });
  await expect(newDriveRadio(page)).toBeChecked();
  await newDriveRadio(page).focus();
  await newDriveRadio(page).press("ArrowDown");
  await expect(existingDriveRadio(page)).toBeChecked();
  await expect(form.createButton).toBeDisabled();
  await existingDriveFolderField(page).fill(
    `https://drive.google.com/drive/folders/${legacy.root.id}`,
  );
  await expect(page.getByText(legacy.root.name, { exact: true })).toBeVisible();
  await expect(page.getByText(EXISTING_DRIVE_COPY.CHECKED, { exact: true })).toBeVisible();
  await expect(form.createButton).toBeEnabled();
  await form.createButton.click();
  await expect(page).toHaveURL(/\/projects\/[0-9a-f-]{36}$/);
  const projectId = readLastPathSegment(page.url());
  expect(await (await api.send(HTTP_METHODS.GET, `/project/${projectId}`)).json()).toMatchObject({
    driveFolderId: legacy.root.id,
    driveFolderLinked: true,
  });
  await expect(page.getByText(EXISTING_DRIVE_COPY.LINKED, { exact: true })).toBeVisible();
  await expect(page.getByText(EXISTING_DRIVE_COPY.MISSING, { exact: true })).toBeVisible();
  const complete = page.getByRole("button", { name: EXISTING_DRIVE_COPY.COMPLETE, exact: true });
  await complete.click();
  await expect(complete).toHaveCount(0);
  expect(
    (await readResponseRecord(await readDriveContents(api, projectId))).missingTemplateFolders,
  ).toEqual([]);
  await page.reload();
  await expect(page.getByText(EXISTING_DRIVE_COPY.LINKED, { exact: true })).toBeVisible();
  await expect(complete).toHaveCount(0);
});

test("stale preview cannot enable submission or replace the currently selected folder", async ({
  page,
  api,
}) => {
  const first = await legacyDriveTree("תיקייה ראשונה מיושנת");
  const second = await legacyDriveTree("תיקייה שנייה נבחרת");
  const customer = await seedCustomer(api);
  const gate = createDeferred();
  const firstStarted = createDeferred();
  const staleTerminal = createDeferred();
  const staleFulfilled = createDeferred();
  const onStaleTerminal = (request: Request): void => {
    if (
      request.url().endsWith("/project-drive/existing-folder/preview") &&
      hasDriveReference(request, first.root.id)
    ) {
      staleTerminal.resolve();
    }
  };
  page.on("requestfinished", onStaleTerminal);
  page.on("requestfailed", onStaleTerminal);
  const form = createProjectFormPage(page);
  await page.route("**/project-drive/existing-folder/preview", async route => {
    const input: unknown = route.request().postDataJSON();
    if (
      typeof input === "object" &&
      input !== null &&
      "reference" in input &&
      input.reference === first.root.id
    ) {
      const response = await route.fetch();
      firstStarted.resolve();
      await gate.promise;
      await route.fulfill({ response });
      staleFulfilled.resolve();
      return;
    }
    await route.continue();
  });
  await form.goto();
  await form.fill({
    name: createUniqueName("בדיקת תיקייה מתחלפת"),
    place: FAKE_PLACES[1],
    customerName: customer.name,
    projectTypeName: PROJECT_TYPE_NAMES.COMMERCIAL,
  });
  try {
    await existingDriveRadio(page).check();
    await existingDriveFolderField(page).fill(first.root.id);
    await firstStarted.promise;
    await expect(form.createButton).toBeDisabled();
    await existingDriveFolderField(page).fill(second.root.id);
    await expect(page.getByText(second.root.name, { exact: true })).toBeVisible();
    gate.resolve();
    await Promise.all([staleTerminal.promise, staleFulfilled.promise]);
    await page.evaluate(
      () =>
        new Promise<void>(resolve =>
          requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
        ),
    );
    await expect(page.getByText(second.root.name, { exact: true })).toBeVisible();
    await expect(page.getByText(first.root.name, { exact: true })).toHaveCount(0);
    await expect(existingDriveFolderField(page)).toHaveValue(second.root.id);
    await expect(form.createButton).toBeEnabled();
    await form.createButton.click();
    await expect(page).toHaveURL(/\/projects\/[0-9a-f-]{36}$/);
    expect(
      await (
        await api.send(HTTP_METHODS.GET, `/project/${readLastPathSegment(page.url())}`)
      ).json(),
    ).toMatchObject({ driveFolderId: second.root.id });
  } finally {
    gate.resolve();
    page.off("requestfinished", onStaleTerminal);
    page.off("requestfailed", onStaleTerminal);
  }
});

test("failed preview preserves input and entered project data; retry resolves it without storing raw folder reference in draft", async ({
  page,
  api,
}) => {
  const legacy = await legacyDriveTree();
  const customer = await seedCustomer(api);
  const form = createProjectFormPage(page);
  const name = createUniqueName("בדיקת כשל תיקייה");
  const attempts = { count: 0 };
  await page.route("**/project-drive/existing-folder/preview", async route => {
    attempts.count += 1;
    if (attempts.count === 1) {
      await route.fulfill({
        status: 404,
        json: { code: EXISTING_DRIVE_ERROR_CODES.NOT_ACCESSIBLE, message: "Unavailable" },
      });
      return;
    }
    await route.continue();
  });
  await form.goto();
  await form.fill({
    name,
    place: FAKE_PLACES[1],
    customerName: customer.name,
    projectTypeName: PROJECT_TYPE_NAMES.COMMERCIAL,
  });
  await existingDriveRadio(page).check();
  await existingDriveFolderField(page).fill(legacy.root.id);
  await expect(page.getByText(EXISTING_DRIVE_COPY.NOT_FOUND, { exact: true })).toBeVisible();
  await expect(existingDriveFolderField(page)).toHaveValue(legacy.root.id);
  await expect(form.nameInput).toHaveValue(name);
  await expect(form.createButton).toBeDisabled();
  await page.getByRole("button", { name: EXISTING_DRIVE_COPY.RETRY, exact: true }).click();
  await expect(page.getByText(EXISTING_DRIVE_COPY.CHECKED, { exact: true })).toBeVisible();
  expect(
    await page.evaluate(
      reference =>
        Object.values(localStorage).some(
          value => typeof value === "string" && value.includes(reference),
        ),
      legacy.root.id,
    ),
  ).toBe(false);
  await page.reload();
  await expect(newDriveRadio(page)).toBeChecked();
  await expect(existingDriveFolderField(page)).toHaveCount(0);
});

test("apartment creation links a legacy folder in its own building and presents a usable mobile Drive card", async ({
  page,
  api,
}) => {
  const legacy = await legacyDriveTree();
  const building = await api.createProject(
    await createLinkedProjectInput(api, legacy.root.id, PROJECT_TYPE_NAMES.RESIDENTIAL_BUILDING),
  );
  const customer = await seedCustomer(api);
  await page.goto(`/projects/${building.id}/apartments/new`);
  const apartment = createApartmentFormPage(page);
  await apartment.fill({
    floor: "3",
    number: createApartmentNumber(),
    customerName: customer.name,
  });
  await existingDriveRadio(page).check();
  await existingDriveFolderField(page).fill(legacy.firstApartment.id);
  await expect(page.getByText(legacy.firstApartment.name, { exact: true })).toBeVisible();
  const created = page.waitForResponse(
    response =>
      response.request().method() === HTTP_METHODS.POST &&
      response.url().endsWith(`/project/${building.id}/apartments`),
  );
  await apartment.submitButton.click();
  const result: unknown = await (await created).json();
  if (!isRecord(result) || typeof result.id !== "string") {
    throw new Error("Apartment create response has no id");
  }
  const apartmentId = result.id;
  await expect(page).toHaveURL(buildProjectRoute(building.id));
  await page.goto(buildApartmentRoute(building.id, apartmentId));
  expect(await (await api.send(HTTP_METHODS.GET, `/project/${apartmentId}`)).json()).toMatchObject({
    driveFolderId: legacy.firstApartment.id,
    driveFolderLinked: true,
    parentProjectId: building.id,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByText(EXISTING_DRIVE_COPY.LINKED, { exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  await page.screenshot({ path: "/tmp/feedback174-mobile-linked-folder.png", fullPage: true });
  await page.goto(buildProjectRoute(building.id));
  await expect(page.getByText(EXISTING_DRIVE_COPY.LINKED, { exact: true })).toBeVisible();
});
