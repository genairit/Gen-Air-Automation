import type { TGenAirApi } from "../../src/api/gen-air-api.ts";
import { isRecord } from "../../src/utilities/guard.utility.ts";
import { buildCustomerInput } from "../../src/api/seed-data.ts";
import { test, expect } from "../../src/fixtures/test.fixture.ts";
import { createProjectPage } from "../../src/pages/project.page.ts";
import { HTTP_METHODS } from "../../src/constants/http.constant.ts";
import { createApartmentPage } from "../../src/pages/apartment.page.ts";
import { buildImportRow } from "../../src/utilities/apartment-import.utility.ts";
import { seedApartment, seedBuilding, seedCustomer } from "../../src/api/seed-data.ts";
import { scopedApartmentNumber } from "../../src/utilities/apartment-fixture.utility.ts";
import { uploadApartments, readBuildingApartments } from "../../src/api/apartment-import.api.ts";
import { relocateApartmentFolderToLegacyRoot } from "../../src/environment/apartment-drive-legacy.ts";

const drivePath = (projectId: string, suffix: string) => `/project-drive/${projectId}/${suffix}`;
const expectedTemplateFolders = [
  "סכמות לאחר ביצוע",
  "טיוטה",
  "סכמות",
  "DWG",
  "הזמנה לביצוע",
  "הזמנות רכש ציוד",
  "PDF",
  "מהאדריכל",
  "הזמנות רכש",
  "ZIP",
  "הצעות מספקים",
  "הצעות מחיר",
].sort();

const automaticFolderId = async (api: TGenAirApi, projectId: string): Promise<string> => {
  const read = async (): Promise<string | null> => {
    const response = await api.send(HTTP_METHODS.GET, `/project/${projectId}`);
    expect(response.status()).toBe(200);
    const project: unknown = await response.json();
    if (!isRecord(project)) {
      throw new Error("Project detail response was malformed");
    }
    return typeof project.driveFolderId === "string" ? project.driveFolderId : null;
  };
  await expect.poll(read).toMatch(/^qa-project-/);
  const folderId = await read();
  if (!folderId) {
    throw new Error("Automatic Drive provisioning did not finish");
  }
  return folderId;
};

const provision = async (api: TGenAirApi, projectId: string) => {
  const response = await api.send(HTTP_METHODS.POST, drivePath(projectId, "provision"));
  expect(response.status()).toBe(201);
  const body: unknown = await response.json();
  expect(isRecord(body)).toBe(true);
  if (!isRecord(body) || typeof body.driveFolderId !== "string") {
    throw new Error("Provision did not return a Drive folder ID");
  }
  return body.driveFolderId;
};

const contents = async (api: TGenAirApi, projectId: string, folderId: string | null = null) => {
  const query = folderId ? `?folderId=${encodeURIComponent(folderId)}` : "";
  const response = await api.send(HTTP_METHODS.GET, drivePath(projectId, `contents${query}`));
  expect(response.status()).toBe(200);
  const body: unknown = await response.json();
  if (!isRecord(body) || !Array.isArray(body.folders)) {
    throw new Error("Drive contents response has no folders");
  }
  return body.folders.filter(isRecord);
};

const folderIdByName = (folders: Record<string, unknown>[], name: string): string => {
  const folder = folders.find(candidate => candidate.name === name);
  if (!folder || typeof folder.id !== "string") {
    throw new Error(`Folder ${name} was not found`);
  }
  return folder.id;
};

const templateFolderNames = (folders: Record<string, unknown>[]): unknown[] =>
  folders
    .filter(folder => typeof folder.id !== "string" || !folder.id.startsWith("qa-nested-"))
    .map(folder => folder.name)
    .sort();

test("new building and apartment create דיירים hierarchy and full apartment template", async ({
  api,
  page,
}) => {
  const building = await seedBuilding(api, await seedCustomer(api));
  const apartment = await seedApartment(api, building);
  const buildingFolderId = await automaticFolderId(api, building.id);
  const apartmentFolderId = await automaticFolderId(api, apartment.id);
  const buildingFolders = await contents(api, building.id);
  const tenantsFolderId = folderIdByName(buildingFolders, "דיירים");
  expect(buildingFolderId).toMatch(/^qa-project-/);
  expect(buildingFolders.filter(folder => folder.name === "דיירים")).toHaveLength(1);
  expect(folderIdByName(await contents(api, building.id, tenantsFolderId), apartment.name)).toBe(
    apartmentFolderId,
  );
  const apartmentFolders = await contents(api, apartment.id);
  expect(templateFolderNames(apartmentFolders)).toEqual(expectedTemplateFolders);
  expect(apartmentFolders.some(folder => folder.name === "דיירים")).toBe(false);
  expect(await provision(api, building.id)).toBe(buildingFolderId);
  expect(await provision(api, apartment.id)).toBe(apartmentFolderId);
  expect(await contents(api, building.id, tenantsFolderId)).toEqual(
    expect.arrayContaining([expect.objectContaining({ id: apartmentFolderId })]),
  );
  await createApartmentPage(page).goto(building.id, apartment.id);
  await expect(
    createProjectPage(page).driveCard.getByRole("button", { name: /^PDF/ }),
  ).toBeVisible();
});

test("imported apartment provisions once below the building tenant folder", async ({ api }) => {
  const building = await seedBuilding(api, await seedCustomer(api));
  const row = buildImportRow(buildCustomerInput(), scopedApartmentNumber("1"));
  expect((await uploadApartments(api, building.id, [row])).counts.created).toBe(1);
  const [apartment] = await readBuildingApartments(api, building.id);
  const apartmentFolderId = await automaticFolderId(api, apartment.id);
  const tenantsFolderId = folderIdByName(await contents(api, building.id), "דיירים");
  const tenantFolders = await contents(api, building.id, tenantsFolderId);
  expect(tenantFolders.filter(folder => folder.id === apartmentFolderId)).toHaveLength(1);
  expect(templateFolderNames(await contents(api, apartment.id))).toEqual(expectedTemplateFolders);
  expect((await uploadApartments(api, building.id, [row])).counts.existing).toBe(1);
  expect(await provision(api, apartment.id)).toBe(apartmentFolderId);
  expect(
    (await contents(api, building.id, tenantsFolderId)).filter(
      folder => folder.id === apartmentFolderId,
    ),
  ).toHaveLength(1);
});

test("legacy apartment repair requires reviewed IDs and preserves the folder link", async ({
  api,
}) => {
  const building = await seedBuilding(api, await seedCustomer(api));
  const apartment = await seedApartment(api, building);
  await automaticFolderId(api, building.id);
  const legacyFolderId = await automaticFolderId(api, apartment.id);
  await relocateApartmentFolderToLegacyRoot(legacyFolderId);
  const repairPath = drivePath(apartment.id, "apartment-folder-repair");
  const previewResponse = await api.send(HTTP_METHODS.GET, repairPath);
  expect(previewResponse.status()).toBe(200);
  const preview: unknown = await previewResponse.json();
  if (!isRecord(preview) || typeof preview.destinationFolderId !== "string") {
    throw new Error("Repair preview did not return a destination");
  }
  expect(preview).toMatchObject({ sourceFolderId: legacyFolderId, status: "needs_move" });
  const beforeRepair = await contents(api, building.id, preview.destinationFolderId);
  expect(beforeRepair.some(folder => folder.name === apartment.name)).toBe(false);
  const stale = await api.send(HTTP_METHODS.POST, repairPath, {
    sourceFolderId: "stale-folder",
    destinationFolderId: preview.destinationFolderId,
  });
  expect(stale.status()).toBe(409);
  const repair = {
    sourceFolderId: legacyFolderId,
    destinationFolderId: preview.destinationFolderId,
  };
  expect((await api.send(HTTP_METHODS.POST, repairPath, repair)).status()).toBe(201);
  expect((await api.send(HTTP_METHODS.POST, repairPath, repair)).status()).toBe(201);
  expect(await provision(api, apartment.id)).toBe(legacyFolderId);
  expect(await (await api.send(HTTP_METHODS.GET, repairPath)).json()).toMatchObject({
    sourceFolderId: legacyFolderId,
    status: "already_placed",
  });
  const tenantFolders = await contents(api, building.id, preview.destinationFolderId);
  expect(
    tenantFolders.filter(folder => folder.id === legacyFolderId && folder.name === apartment.name),
  ).toHaveLength(1);
  expect(templateFolderNames(await contents(api, apartment.id))).toEqual(expectedTemplateFolders);
});
