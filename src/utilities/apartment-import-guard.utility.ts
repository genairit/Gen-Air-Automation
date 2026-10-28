import type {
  IImportResult,
  IImportedApartment,
} from "../interfaces/apartment-import.interface.ts";

import { isRecord } from "./guard.utility.ts";

export const isImportResult = (value: unknown): value is IImportResult => {
  if (!isRecord(value)) {
    return false;
  }

  const hasCounts =
    isRecord(value.counts) && Object.values(value.counts).every(count => typeof count === "number");
  const hasRows = Array.isArray(value.rows);
  const hasReport = value.reportBase64 === null || typeof value.reportBase64 === "string";
  return hasCounts && hasRows && hasReport;
};

export const isImportedApartment = (value: unknown): value is IImportedApartment => {
  if (!isRecord(value)) {
    return false;
  }

  const hasIdentity = typeof value.id === "string" && typeof value.customerId === "string";
  const hasApartment = typeof value.customerApartment === "string";
  const hasCredit = value.apartmentCredit === null || typeof value.apartmentCredit === "string";
  const hasOwnership =
    value.apartmentOwnership === null || typeof value.apartmentOwnership === "string";
  return hasIdentity && hasApartment && hasCredit && hasOwnership;
};

export const readImportedApartments = (value: unknown): IImportedApartment[] => {
  if (!isRecord(value) || !Array.isArray(value.items) || !value.items.every(isImportedApartment)) {
    throw new Error("Unexpected apartments response");
  }

  return value.items;
};
