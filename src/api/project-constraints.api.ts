import type { TGenAirApi } from "./gen-air-api.ts";
import type { APIResponse } from "@playwright/test";
import { isRecord } from "../utilities/guard.utility.ts";
import { HTTP_METHODS } from "../constants/http.constant.ts";
import type { IProjectConstraintRecord } from "../interfaces/project-constraints.interface.ts";

export const readProjectConstraintResponse = async (
  response: APIResponse,
): Promise<IProjectConstraintRecord> => {
  if (!response.ok()) {
    throw new Error(
      `Project constraints request failed: ${response.status()} ${await response.text()}`,
    );
  }

  const body: unknown = await response.json();
  if (!isRecord(body)) {
    throw new Error("Expected a project object");
  }

  const id = body.id;
  const name = body.name;
  const hasIdentity = typeof id === "string" && typeof name === "string";
  const enabled = body.hasGeneralLightingCeilingLowering;
  const height = body.generalLightingCeilingLoweringHeight;
  const hasValidHeight = height === null || (typeof height === "number" && Number.isFinite(height));
  if (!hasIdentity || typeof enabled !== "boolean" || !hasValidHeight) {
    throw new Error("Expected project lighting fields");
  }

  return {
    id,
    name,
    hasGeneralLightingCeilingLowering: enabled,
    generalLightingCeilingLoweringHeight: height,
  };
};

export const readProjectConstraints = (api: TGenAirApi, id: string) =>
  api.send(HTTP_METHODS.GET, `/project/${id}`).then(readProjectConstraintResponse);

export const projectNameAvailabilityPath = (
  name: string,
  excludeId: string | null = null,
): string => {
  const query = new URLSearchParams({ name });
  if (excludeId) {
    query.set("excludeId", excludeId);
  }

  return `/project/name-availability?${query}`;
};
