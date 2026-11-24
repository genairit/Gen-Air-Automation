import type { TGenAirApi } from "./gen-air-api.ts";
import type { APIResponse } from "@playwright/test";
import { isRecord } from "../utilities/guard.utility.ts";
import { HTTP_METHODS } from "../constants/http.constant.ts";
import type { ICustomerOwnDetails } from "../interfaces/customer-own-details.interface.ts";

const isNullableString = (value: unknown): value is string | null =>
  value === null || typeof value === "string";

const isCustomerOwnDetails = (value: unknown): value is ICustomerOwnDetails => {
  if (!isRecord(value) || typeof value.id !== "string" || typeof value.name !== "string") {
    return false;
  }

  if (!isNullableString(value.primaryContactId)) {
    return false;
  }

  const contact = value.primaryContact;
  if (contact === null) {
    return true;
  }

  return (
    isRecord(contact) &&
    typeof contact.id === "string" &&
    typeof contact.name === "string" &&
    isNullableString(contact.phone) &&
    isNullableString(contact.email)
  );
};

export const customerOwnDetails = async (response: APIResponse): Promise<ICustomerOwnDetails> => {
  const value: unknown = await response.json();
  if (!response.ok() || !isCustomerOwnDetails(value)) {
    throw new Error(`Invalid customer own-details response: ${response.status()}`);
  }

  return value;
};

export const readCustomerOwnDetails = async (api: TGenAirApi, id: string) =>
  customerOwnDetails(await api.send(HTTP_METHODS.GET, `/customer/${id}`));
