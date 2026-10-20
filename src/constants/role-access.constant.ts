import { USER_ROLES, type UserRoleType } from "./user-role.constant.ts";
import type { IRoleAccess } from "../interfaces/role-access.interface.ts";

const NO_ACCESS: IRoleAccess = {
  canClaimTasks: false,
  canEditProject: false,
  canManageTasks: false,
  canManageUsers: false,
  canCreateProject: false,
  canDeleteProject: false,
  canManageCustomers: false,
  canMoveProjectStage: false,
  canChangeTaskStatus: false,
};

const PROJECT_EDITOR_ACCESS: IRoleAccess = {
  ...NO_ACCESS,
  canEditProject: true,
  canMoveProjectStage: true,
};

export const ROLE_ACCESS: Record<UserRoleType, IRoleAccess> = {
  [USER_ROLES.SYSTEM_ADMIN]: {
    ...PROJECT_EDITOR_ACCESS,
    canManageTasks: true,
    canManageUsers: true,
    canCreateProject: true,
    canDeleteProject: true,
    canManageCustomers: true,
    canChangeTaskStatus: true,
  },
  [USER_ROLES.ENGINEER]: {
    ...NO_ACCESS,
    canClaimTasks: true,
    canChangeTaskStatus: true,
  },
  [USER_ROLES.SECRETARY]: PROJECT_EDITOR_ACCESS,
  [USER_ROLES.PROJECT_MANAGER]: PROJECT_EDITOR_ACCESS,
  [USER_ROLES.FINANCE]: NO_ACCESS,
  [USER_ROLES.INSTALLER]: NO_ACCESS,
};
