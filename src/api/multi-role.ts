import { buildUserInput } from "./seed-data.ts";
import type { TGenAirApi } from "./gen-air-api.ts";
import { API_PATHS } from "../constants/api.constant.ts";
import { HTTP_METHODS } from "../constants/http.constant.ts";
import type { UserRoleType } from "../constants/user-role.constant.ts";

export const seedMultiRoleUser = async (
  api: TGenAirApi,
  assignedRoles: UserRoleType[],
  activeRole: UserRoleType = assignedRoles[0],
) => {
  const input = { ...buildUserInput(activeRole), assignedRoles };
  const user = await api.createUser(input);

  return { ...user, password: input.password };
};

export const switchRole = (api: TGenAirApi, role: string) =>
  api.send(HTTP_METHODS.PATCH, API_PATHS.SWITCH_ROLE, { role });
