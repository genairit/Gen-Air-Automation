import type {
  IPaymentConfiguration,
  ICustomerPaymentConfiguration,
} from "../interfaces/payment-configuration.interface.ts";

import type { TGenAirApi } from "./gen-air-api.ts";
import type { APIResponse } from "@playwright/test";
import { isRecord } from "../utilities/guard.utility.ts";
import { HTTP_METHODS } from "../constants/http.constant.ts";
import { buildCustomerPath } from "../utilities/api-path.utility.ts";

const isCustomerPaymentConfiguration = (value: unknown): value is ICustomerPaymentConfiguration => {
  if (!isRecord(value) || typeof value.id !== "string" || typeof value.name !== "string") {
    return false;
  }

  const hasTerms = value.paymentTerms === null || typeof value.paymentTerms === "string";
  const hasSchedule =
    Array.isArray(value.paymentSchedule) &&
    value.paymentSchedule.every(
      stage =>
        isRecord(stage) && typeof stage.percent === "string" && typeof stage.text === "string",
    );
  return hasTerms && hasSchedule;
};

export const customerPaymentConfiguration = async (
  response: APIResponse,
): Promise<ICustomerPaymentConfiguration> => {
  const value: unknown = await response.json();
  if (!response.ok() || !isCustomerPaymentConfiguration(value)) {
    throw new Error(`Invalid customer payment configuration: ${response.status()}`);
  }

  return value;
};

export const readCustomerPaymentConfiguration = (
  api: TGenAirApi,
  id: string,
): Promise<ICustomerPaymentConfiguration> =>
  api.send(HTTP_METHODS.GET, buildCustomerPath(id)).then(customerPaymentConfiguration);

export const updateCustomerPaymentConfiguration = (
  api: TGenAirApi,
  id: string,
  configuration: IPaymentConfiguration,
): Promise<ICustomerPaymentConfiguration> =>
  api
    .send(HTTP_METHODS.PATCH, buildCustomerPath(id), configuration)
    .then(customerPaymentConfiguration);
