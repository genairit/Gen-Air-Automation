import type { UserRoleType } from "../constants/user-role.constant.ts";

export interface ICredentials {
  email: string;
  password: string;
}

export interface ITestUser extends ICredentials {
  phone: string;
  lastName: string;
  firstName: string;
  role: UserRoleType;
}
