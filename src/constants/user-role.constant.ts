export const USER_ROLES = {
  SECRETARY: "secretary",
  SYSTEM_ADMIN: "system_admin",
  LEAD_INSTALLER: "lead_installer",
  PROJECT_MANAGER: "project_manager",
} as const;

export type UserRoleType = (typeof USER_ROLES)[keyof typeof USER_ROLES];

export const USER_ROLE_VALUES: UserRoleType[] = Object.values(USER_ROLES);

export const USER_ROLE_LABELS: Record<UserRoleType, string> = {
  [USER_ROLES.SECRETARY]: "מזכירה",
  [USER_ROLES.SYSTEM_ADMIN]: "מנהל מערכת",
  [USER_ROLES.LEAD_INSTALLER]: "מתקין ראשי",
  [USER_ROLES.PROJECT_MANAGER]: "מנהל פרויקט",
};

export const USER_ROLE_PLURAL_LABELS: Record<UserRoleType, string> = {
  [USER_ROLES.SECRETARY]: "מזכירות",
  [USER_ROLES.LEAD_INSTALLER]: "מתקינים",
  [USER_ROLES.SYSTEM_ADMIN]: "מנהלי מערכת",
  [USER_ROLES.PROJECT_MANAGER]: "מנהלי פרויקטים",
};
