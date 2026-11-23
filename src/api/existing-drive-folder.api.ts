import type { TGenAirApi } from "./gen-air-api.ts";
import type { APIResponse } from "@playwright/test";
import { isRecord } from "../utilities/guard.utility.ts";
import { HTTP_METHODS } from "../constants/http.constant.ts";
import { buildCustomerInput, buildProjectInput } from "./seed-data.ts";
import { EXISTING_DRIVE } from "../environment/existing-drive-fixtures.ts";
import type { ILinkedProjectInput } from "../interfaces/existing-drive-input.interface.ts";
import { PROJECT_TYPE_NAMES, type ProjectTypeNameType } from "../constants/domain.constant.ts";

export const readResponseRecord = async (
  response: APIResponse,
): Promise<Record<string, unknown>> => {
  const body: unknown = await response.json();
  if (!isRecord(body)) {
    throw new Error(`Expected object from ${response.url()}`);
  }
  return body;
};

export const previewExistingFolder = (
  api: TGenAirApi,
  reference: string,
  buildingId: string | null = null,
): Promise<APIResponse> =>
  api.send(HTTP_METHODS.POST, EXISTING_DRIVE.PREVIEW, {
    reference,
    ...(buildingId ? { buildingId } : {}),
  });

export const createLinkedProjectInput = async (
  api: TGenAirApi,
  reference: string,
  projectTypeName: ProjectTypeNameType = PROJECT_TYPE_NAMES.COMMERCIAL,
): Promise<ILinkedProjectInput> => {
  const customer = await api.createCustomer(buildCustomerInput());
  const projectType = await api.findProjectType(projectTypeName);
  return {
    ...buildProjectInput({ customer, projectTypeId: projectType.id }),
    existingDriveFolder: reference,
  };
};

export const readDriveContents = (
  api: TGenAirApi,
  projectId: string,
  folderId: string | null = null,
): Promise<APIResponse> =>
  api.send(
    HTTP_METHODS.GET,
    `/project-drive/${projectId}/contents${folderId ? `?folderId=${encodeURIComponent(folderId)}` : ""}`,
  );

export const readRecordRows = (
  body: Record<string, unknown>,
  key: string,
): Record<string, unknown>[] => {
  const rows = body[key];
  if (!Array.isArray(rows) || !rows.every(isRecord)) {
    throw new Error(`Response has no ${key} record list`);
  }
  return rows;
};
