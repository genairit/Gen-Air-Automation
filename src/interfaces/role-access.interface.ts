export interface IRoleAccess {
  canClaimTasks: boolean;
  canEditProject: boolean;
  canManageTasks: boolean;
  canManageUsers: boolean;
  canCreateProject: boolean;
  canDeleteProject: boolean;
  canManageCustomers: boolean;
  canMoveProjectStage: boolean;
  canChangeTaskStatus: boolean;
}
