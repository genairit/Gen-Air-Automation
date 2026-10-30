import type { TGenAirApi } from "./gen-air-api.ts";
import { HTTP_METHODS } from "../constants/http.constant.ts";
import { isRecord, isNumberRecord } from "../utilities/guard.utility.ts";
import type { ICustomerProjectsPage } from "../interfaces/customer-projects.interface.ts";

export const customerProjectsPath = (customerId: string, query: Record<string, string> = {}) =>
  `/customer/${customerId}/projects?${new URLSearchParams(query)}`;

const isReference = (value: unknown): boolean =>
  isRecord(value) && [value.id, value.name, value.code].every(field => typeof field === "string");

const isMember = (
  value: unknown,
): value is { user: { id: string; firstName: string; lastName: string } | null } => {
  if (!isRecord(value)) {
    return false;
  }
  if (value.user === null) {
    return true;
  }
  return (
    isRecord(value.user) &&
    [value.user.id, value.user.firstName, value.user.lastName].every(
      field => typeof field === "string",
    )
  );
};

const isItem = (value: unknown) =>
  isReference(value) &&
  isRecord(value) &&
  typeof value.kind === "string" &&
  ["building", "project", "apartment"].includes(value.kind) &&
  typeof value.stageId === "string" &&
  Number.isInteger(value.apartmentCount) &&
  (value.building === null || isReference(value.building)) &&
  Array.isArray(value.members) &&
  value.members.every(isMember);

const isCustomerProjectsPage = (body: unknown): body is ICustomerProjectsPage =>
  isRecord(body) &&
  typeof body.total === "number" &&
  Array.isArray(body.items) &&
  body.items.every(isItem) &&
  (body.nextCursor === null || typeof body.nextCursor === "string") &&
  isRecord(body.counts) &&
  isNumberRecord(body.counts.byStage);

export const readCustomerProjects = async (
  api: TGenAirApi,
  customerId: string,
  query: Record<string, string> = {},
): Promise<ICustomerProjectsPage> => {
  const response = await api.send(HTTP_METHODS.GET, customerProjectsPath(customerId, query));
  if (!response.ok()) {
    throw new Error(`Customer projects returned ${response.status()}: ${await response.text()}`);
  }
  const body: unknown = await response.json();
  if (!isCustomerProjectsPage(body)) {
    throw new Error("Customer projects returned an invalid page");
  }
  return body;
};
