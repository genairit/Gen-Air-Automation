import type { TGenAirApi } from "./gen-air-api.ts";
import { isRecord } from "../utilities/guard.utility.ts";
import { HTTP_METHODS } from "../constants/http.constant.ts";
import { createUniqueName } from "../utilities/test-data.utility.ts";
import type { ProjectContactRoleType } from "../constants/project-contact-role.constant.ts";

export interface IRoleContact {
  id: string;
  name: string;
  phone: string;
  email: string;
}

export interface IRoleContactLink {
  contactId: string;
  isPrimary: boolean;
  role: string | null;
  contact: { name: string };
}

export const contactRolePath = (projectId: string, role: ProjectContactRoleType): string =>
  `/project/${projectId}/contacts/roles/${role}`;

export const seedRoleContact = async (api: TGenAirApi): Promise<IRoleContact> => {
  const input = {
    name: createUniqueName("איש קשר לתפקיד"),
    phone: "+12025550123",
    email: "role-contact@example.com",
  };
  const response = await api.send(HTTP_METHODS.POST, "/contact-directory", input);
  const body: unknown = await response.json();
  if (!response.ok() || !isRecord(body) || typeof body.id !== "string") {
    throw new Error(`Cannot seed role contact: ${response.status()}`);
  }

  return { ...input, id: body.id };
};

const isRoleLink = (value: unknown): value is IRoleContactLink =>
  isRecord(value) &&
  typeof value.contactId === "string" &&
  typeof value.isPrimary === "boolean" &&
  (value.role === null || typeof value.role === "string") &&
  isRecord(value.contact) &&
  typeof value.contact.name === "string";

export const readRoleLinks = async (
  api: TGenAirApi,
  projectId: string,
): Promise<IRoleContactLink[]> => {
  const response = await api.send(HTTP_METHODS.GET, `/project/${projectId}/contacts`);
  const body: unknown = await response.json();
  if (!response.ok() || !Array.isArray(body) || !body.every(isRoleLink)) {
    throw new Error(`Cannot read role contacts: ${response.status()}`);
  }

  return body;
};
