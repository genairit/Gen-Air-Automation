import { USER_ROLES, type UserRoleType } from "./user-role.constant.ts";
import type { IRoleAccess } from "../interfaces/role-access.interface.ts";

export const ROLE_ACCESS: Record<UserRoleType, IRoleAccess> = {
  [USER_ROLES.SYSTEM_ADMIN]: {
    canManageTasks: true,
    canManageUsers: true,
    canCreateProject: true,
    canManageCustomers: true,
  },
  [USER_ROLES.PROJECT_MANAGER]: {
    canManageTasks: true,
    canManageUsers: false,
    canCreateProject: true,
    canManageCustomers: true,
  },
  [USER_ROLES.SECRETARY]: {
    canManageTasks: false,
    canManageUsers: false,
    canCreateProject: true,
    canManageCustomers: false,
  },
  [USER_ROLES.LEAD_INSTALLER]: {
    canManageTasks: false,
    canManageUsers: false,
    canCreateProject: false,
    canManageCustomers: false,
  },
};
