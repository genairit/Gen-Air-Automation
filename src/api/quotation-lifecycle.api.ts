import type { TGenAirApi } from "./gen-air-api.ts";
import { isRecord } from "../utilities/guard.utility.ts";
import { HTTP_METHODS } from "../constants/http.constant.ts";
import { QUOTATION } from "../constants/quotation.constant.ts";
import { QUOTATION_LIFECYCLE } from "../constants/quotation-lifecycle.constant.ts";
import type { IQuotationLifecycleEvent } from "../interfaces/quotation-lifecycle.interface.ts";

const isLifecycleEvent = (value: unknown): value is IQuotationLifecycleEvent => {
  if (!isRecord(value)) {
    return false;
  }

  const hasIdentity = ["id", "quotationId", "actorId", "actorName", "occurredAt"].every(
    (key): boolean => typeof value[key] === "string" && value[key].length > 0,
  );
  const hasAction = Object.values(QUOTATION_LIFECYCLE).some(
    (action): boolean => action === value.action,
  );
  const hasStatuses = [value.fromStatus, value.toStatus].every((status): boolean =>
    Object.values(QUOTATION.STATUS).some((candidate): boolean => candidate === status),
  );
  const hasReason = value.reason === null || typeof value.reason === "string";
  const hasVersion = typeof value.quotationVersion === "number";
  return hasIdentity && hasAction && hasStatuses && hasReason && hasVersion;
};

export const readLifecycleHistory = async (
  api: TGenAirApi,
  quotationId: string,
): Promise<IQuotationLifecycleEvent[]> => {
  const response = await api.send(HTTP_METHODS.GET, `/quotation/${quotationId}`);
  const body: unknown = await response.json();
  if (!response.ok() || !isRecord(body) || !Array.isArray(body.lifecycleHistory)) {
    throw new Error(`Invalid lifecycle response ${response.status()}`);
  }

  const history: unknown[] = body.lifecycleHistory;
  if (!history.every(isLifecycleEvent)) {
    throw new Error("Invalid lifecycle event summary");
  }

  return history;
};
