import {
  readRecordRows,
  readDriveContents,
  readResponseRecord,
  previewExistingFolder,
  createLinkedProjectInput,
} from "../../src/api/existing-drive-folder.api.ts";

import {
  EXISTING_DRIVE,
  legacyDriveItem,
  legacyDriveTree,
  readFolderCreations,
  registerLegacyDriveItems,
} from "../../src/environment/existing-drive-fixtures.ts";

import { seedCustomer } from "../../src/api/seed-data.ts";
import { test, expect } from "../../src/fixtures/api.fixture.ts";
import { URLS } from "../../src/constants/environment.constant.ts";
import { SEED_VALUES } from "../../src/constants/seed.constant.ts";
import { HTTP_METHODS } from "../../src/constants/http.constant.ts";
import { USER_ROLES } from "../../src/constants/user-role.constant.ts";
import { TEST_USERS } from "../../src/constants/test-users.constant.ts";
import { PROJECT_TYPE_NAMES } from "../../src/constants/domain.constant.ts";
import { createApartmentNumber } from "../../src/utilities/apartment-fixture.utility.ts";
import { EXISTING_DRIVE_ERROR_CODES } from "../../src/constants/existing-drive-folder.constant.ts";

test("existing folder preview is read-only; linking and repeated reads preserve files until explicit idempotent completion", async ({
  api,
}) => {
  const legacy = await legacyDriveTree();
  const before = await readFolderCreations();
  for (const reference of [
    legacy.root.id,
    `https://drive.google.com/drive/folders/${legacy.root.id}?usp=sharing`,
  ]) {
    const preview = await previewExistingFolder(api, reference);
    expect(preview.status()).toBe(200);
    expect(await preview.json()).toMatchObject({
      id: legacy.root.id,
      name: legacy.root.name,
      missingTemplateFolders: expect.arrayContaining(["PDF"]),
    });
  }
  expect(await readFolderCreations()).toEqual(before);
  const input = await createLinkedProjectInput(api, legacy.root.id);
  const project = await api.createProject(input);
  const detail = await api.send(HTTP_METHODS.GET, `/project/${project.id}`);
  expect(await detail.json()).toMatchObject({
    driveFolderId: legacy.root.id,
    driveFolderLinked: true,
    name: input.name,
  });
  for (const suffix of ["contents", "provision", "contents"]) {
    const response = await api.send(
      suffix === "provision" ? HTTP_METHODS.POST : HTTP_METHODS.GET,
      `/project-drive/${project.id}/${suffix}`,
    );
    expect(response.ok()).toBe(true);
  }
  expect(await readFolderCreations()).toEqual(before);
  const original = await readResponseRecord(await readDriveContents(api, project.id));
  expect(readRecordRows(original, "files")).toContainEqual(
    expect.objectContaining({ id: legacy.file.id, name: legacy.file.name }),
  );
  expect(readRecordRows(original, "folders")).toContainEqual(
    expect.objectContaining({ id: legacy.quotations.id, name: EXISTING_DRIVE.QUOTATIONS }),
  );
  const completion = await api.send(
    HTTP_METHODS.POST,
    `/project-drive/${project.id}/complete-template`,
  );
  expect(completion.status()).toBe(201);
  const completed = await readResponseRecord(await readDriveContents(api, project.id));
  expect(completed.missingTemplateFolders).toEqual([]);
  expect(readRecordRows(completed, "files")).toContainEqual(
    expect.objectContaining({ id: legacy.file.id, name: legacy.file.name }),
  );
  expect(readRecordRows(completed, "folders")).toContainEqual(
    expect.objectContaining({ id: legacy.quotations.id }),
  );
  const after = await readFolderCreations();
  expect(after.length).toBeGreaterThan(before.length);
  expect(
    after.filter(
      folder =>
        folder.parents.includes(legacy.root.id) && folder.name === EXISTING_DRIVE.QUOTATIONS,
    ),
  ).toHaveLength(0);
  expect(
    (await api.send(HTTP_METHODS.POST, `/project-drive/${project.id}/complete-template`)).status(),
  ).toBe(201);
  expect(await readFolderCreations()).toEqual(after);
});

test("invalid, missing, trashed, non-folder, outside-company and duplicate-template folders fail without creating projects", async ({
  api,
}) => {
  const outside = legacyDriveItem("מחוץ לחברה", null);
  const file = legacyDriveItem("קובץ.pdf", EXISTING_DRIVE.ROOT, EXISTING_DRIVE.PDF);
  const trashed = { ...legacyDriveItem("נמחקה"), trashed: true };
  const duplicateRoot = legacyDriveItem("כפילות");
  await registerLegacyDriveItems([
    outside,
    file,
    trashed,
    duplicateRoot,
    legacyDriveItem("PDF", duplicateRoot.id),
    legacyDriveItem("PDF", duplicateRoot.id),
  ]);
  const cases = [
    {
      reference: "https://attacker.example/folders/test",
      status: 400,
      code: EXISTING_DRIVE_ERROR_CODES.REFERENCE_INVALID,
    },
    {
      reference: "unknown-legacy-folder",
      status: 404,
      code: EXISTING_DRIVE_ERROR_CODES.NOT_ACCESSIBLE,
    },
    { reference: trashed.id, status: 404, code: EXISTING_DRIVE_ERROR_CODES.NOT_ACCESSIBLE },
    { reference: file.id, status: 400, code: EXISTING_DRIVE_ERROR_CODES.REQUIRED },
    { reference: outside.id, status: 400, code: EXISTING_DRIVE_ERROR_CODES.OUTSIDE_COMPANY },
    {
      reference: EXISTING_DRIVE.ROOT,
      status: 400,
      code: EXISTING_DRIVE_ERROR_CODES.OUTSIDE_COMPANY,
    },
    {
      reference: duplicateRoot.id,
      status: 409,
      code: EXISTING_DRIVE_ERROR_CODES.TEMPLATE_AMBIGUOUS,
    },
  ];
  const before = await readFolderCreations();
  for (const scenario of cases) {
    const response = await previewExistingFolder(api, scenario.reference);
    expect(response.status(), scenario.reference).toBe(scenario.status);
    expect(await response.json()).toMatchObject({ code: scenario.code });
  }
  const input = await createLinkedProjectInput(api, outside.id);
  const rejected = await api.send(HTTP_METHODS.POST, "/project", input);
  expect(rejected.status()).toBe(400);
  const search = await readResponseRecord(
    await api.send(HTTP_METHODS.GET, `/project?search=${encodeURIComponent(input.name)}`),
  );
  expect(readRecordRows(search, "items")).toHaveLength(0);
  expect(await readFolderCreations()).toEqual(before);
});

test("folder ownership conflicts and concurrent adoption allow one durable owner only", async ({
  api,
}) => {
  const legacy = await legacyDriveTree();
  const first = await createLinkedProjectInput(api, legacy.root.id);
  const second = await createLinkedProjectInput(api, legacy.root.id);
  const results = await Promise.all([
    api.send(HTTP_METHODS.POST, "/project", first),
    api.send(HTTP_METHODS.POST, "/project", second),
  ]);
  expect(results.map(response => response.status()).sort()).toEqual([201, 409]);
  const conflicts = [
    { id: legacy.root.id, code: EXISTING_DRIVE_ERROR_CODES.ALREADY_LINKED },
    { id: legacy.nested.id, code: EXISTING_DRIVE_ERROR_CODES.OWNERSHIP_OVERLAP },
  ];
  for (const scenario of conflicts) {
    const response = await previewExistingFolder(api, scenario.id);
    expect(response.status()).toBe(409);
    expect(await response.json()).toMatchObject({ code: scenario.code });
  }
  const ancestor = legacyDriveItem("תיקיית אב");
  const ownedChild = legacyDriveItem("פרויקט בתוך האב", ancestor.id);
  await registerLegacyDriveItems([ancestor, ownedChild]);
  await api.createProject(await createLinkedProjectInput(api, ownedChild.id));
  const overlap = await previewExistingFolder(api, ancestor.id);
  expect(overlap.status()).toBe(409);
  expect(await overlap.json()).toMatchObject({
    code: EXISTING_DRIVE_ERROR_CODES.OWNERSHIP_OVERLAP,
  });
});

test("linked building keeps its own two apartments usable and rejects wrong apartment placement", async ({
  api,
}) => {
  const legacy = await legacyDriveTree();
  const building = await api.createProject(
    await createLinkedProjectInput(api, legacy.root.id, PROJECT_TYPE_NAMES.RESIDENTIAL_BUILDING),
  );
  const wrong = await previewExistingFolder(api, legacy.nested.id, building.id);
  expect(wrong.status()).toBe(409);
  expect(await wrong.json()).toMatchObject({
    code: EXISTING_DRIVE_ERROR_CODES.APARTMENT_LOCATION_INVALID,
  });
  for (const folder of [legacy.firstApartment, legacy.secondApartment]) {
    expect((await previewExistingFolder(api, folder.id, building.id)).status()).toBe(200);
    const apartment = await api.createApartment(building.id, {
      customerId: (await seedCustomer(api)).id,
      customerFloor: SEED_VALUES.APARTMENT_FLOOR,
      customerApartment: createApartmentNumber(),
      existingDriveFolder: folder.id,
    });
    expect(
      await (await api.send(HTTP_METHODS.GET, `/project/${apartment.id}`)).json(),
    ).toMatchObject({ driveFolderId: folder.id, driveFolderLinked: true });
    expect((await readDriveContents(api, apartment.id)).status()).toBe(200);
    expect((await readDriveContents(api, building.id)).status()).toBe(200);
  }
  expect(
    (await api.send(HTTP_METHODS.POST, `/project-drive/${building.id}/provision`)).status(),
  ).toBe(201);
});

test("preview and template completion enforce authorization without Drive mutation", async ({
  api,
  apiAs,
  request,
}) => {
  const legacy = await legacyDriveTree();
  const anonymous = await request.post(`${URLS.BACKEND}${EXISTING_DRIVE.PREVIEW}`, {
    data: { reference: legacy.root.id },
  });
  expect(anonymous.status()).toBe(401);
  const installer = await apiAs(TEST_USERS[USER_ROLES.INSTALLER]);
  expect((await previewExistingFolder(installer, legacy.root.id)).status()).toBe(403);
  const project = await api.createProject(await createLinkedProjectInput(api, legacy.root.id));
  const before = await readFolderCreations();
  expect(
    (
      await installer.send(HTTP_METHODS.POST, `/project-drive/${project.id}/complete-template`)
    ).status(),
  ).toBe(403);
  expect(await readFolderCreations()).toEqual(before);
});

test("apartment-only creator can preview an apartment but cannot preview project adoption", async ({
  api,
  apiAs,
}) => {
  const legacy = await legacyDriveTree();
  const building = await api.createProject(
    await createLinkedProjectInput(api, legacy.root.id, PROJECT_TYPE_NAMES.RESIDENTIAL_BUILDING),
  );
  const secretary = await apiAs(TEST_USERS[USER_ROLES.SECRETARY]);
  expect(
    (await previewExistingFolder(secretary, legacy.firstApartment.id, building.id)).status(),
  ).toBe(200);
  expect((await previewExistingFolder(secretary, legacy.firstApartment.id)).status()).toBe(403);
});
