import type {
  IImportResult,
  IImportedApartment,
} from "../interfaces/apartment-import.interface.ts";

import {
  isImportResult,
  readImportedApartments,
} from "../utilities/apartment-import-guard.utility.ts";

import { expect } from "@playwright/test";
import type { TGenAirApi } from "./gen-air-api.ts";
import { HTTP_METHODS } from "../constants/http.constant.ts";
import { APARTMENT_IMPORT } from "../constants/apartment-import.constant.ts";
import { importPath, makeImportWorkbook } from "../utilities/apartment-import.utility.ts";

export const uploadApartments = async (
  api: TGenAirApi,
  buildingId: string,
  rows: readonly string[][],
): Promise<IImportResult> => {
  const response = await api.upload(importPath(buildingId), {
    name: APARTMENT_IMPORT.FILE_NAME,
    mimeType: APARTMENT_IMPORT.MIME_TYPE,
    buffer: await makeImportWorkbook(rows),
  });
  expect(response.status()).toBe(201);
  const body: unknown = await response.json();
  if (!isImportResult(body)) {
    throw new Error("Unexpected import result");
  }

  return body;
};

export const readBuildingApartments = async (
  api: TGenAirApi,
  buildingId: string,
): Promise<IImportedApartment[]> => {
  const response = await api.send(
    HTTP_METHODS.GET,
    `/project/${buildingId}/apartments?batchSize=100`,
  );
  expect(response.ok()).toBe(true);
  return readImportedApartments(await response.json());
};
