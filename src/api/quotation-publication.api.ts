import {
  PUBLICATION_KIND,
  PUBLICATION_STATE,
} from "../constants/quotation-publication.constant.ts";

import type { TGenAirApi } from "./gen-air-api.ts";
import { isRecord } from "../utilities/guard.utility.ts";
import { HTTP_METHODS } from "../constants/http.constant.ts";
import type { IPublicationSummary } from "../interfaces/quotation-publication.interface.ts";

const isSummary = (value: unknown): value is IPublicationSummary => {
  if (!isRecord(value) || typeof value.state !== "string" || typeof value.canRetry !== "boolean") {
    return false;
  }

  const hasKnownState = Object.values(PUBLICATION_STATE).some(
    (state): boolean => state === value.state,
  );
  const hasKnownKind =
    value.documentKind === null ||
    Object.values(PUBLICATION_KIND).some((kind): boolean => kind === value.documentKind);
  const nullableStrings = [
    "reason",
    "cycleId",
    "fileUrl",
    "documentKind",
    "destinationLabel",
    "updatedAt",
  ];
  const nullableNumbers = ["generation", "sourceVersion"];
  const hasDescription = nullableStrings.every(
    (key): boolean => value[key] === null || typeof value[key] === "string",
  );
  const hasVersions = nullableNumbers.every(
    (key): boolean => value[key] === null || typeof value[key] === "number",
  );
  const hasHistory = Array.isArray(value.history) && value.history.every(isRecord);
  return hasKnownState && hasKnownKind && hasDescription && hasVersions && hasHistory;
};
export const readPublication = async (
  api: TGenAirApi,
  id: string,
): Promise<IPublicationSummary> => {
  const response = await api.send(HTTP_METHODS.GET, `/quotation/${id}/publication`);
  const value: unknown = await response.json();
  if (!response.ok() || !isSummary(value)) {
    throw new Error(`Invalid publication summary ${response.status()}`);
  }

  return value;
};
