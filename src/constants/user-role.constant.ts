export const USER_ROLES = {
  FINANCE: "finance",
  ENGINEER: "engineer",
  INSTALLER: "installer",
  SECRETARY: "secretary",
  SYSTEM_ADMIN: "system_admin",
  PROJECT_MANAGER: "project_manager",
  PURCHASING_EXECUTION_MANAGER: "purchasing_execution_manager",
} as const;

export type UserRoleType = (typeof USER_ROLES)[keyof typeof USER_ROLES];

export const USER_ROLE_VALUES: UserRoleType[] = [
  USER_ROLES.SYSTEM_ADMIN,
  USER_ROLES.ENGINEER,
  USER_ROLES.SECRETARY,
  USER_ROLES.PROJECT_MANAGER,
  USER_ROLES.FINANCE,
  USER_ROLES.INSTALLER,
  USER_ROLES.PURCHASING_EXECUTION_MANAGER,
];

export const PROJECT_MEMBER_ROLES = [
  USER_ROLES.ENGINEER,
  USER_ROLES.SECRETARY,
  USER_ROLES.PROJECT_MANAGER,
  USER_ROLES.INSTALLER,
] as const satisfies readonly UserRoleType[];

export type ProjectMemberRoleType = (typeof PROJECT_MEMBER_ROLES)[number];

export const NON_MEMBER_ROLES: UserRoleType[] = [
  USER_ROLES.SYSTEM_ADMIN,
  USER_ROLES.FINANCE,
  USER_ROLES.PURCHASING_EXECUTION_MANAGER,
];

export const RETIRED_ROLES = {
  LEAD_INSTALLER: "lead_installer",
} as const;

export const USER_ROLE_LABELS: Record<UserRoleType, string> = {
  [USER_ROLES.FINANCE]: "מחלקת כספים",
  [USER_ROLES.ENGINEER]: "עובד הנדסה",
  [USER_ROLES.INSTALLER]: "מתקין",
  [USER_ROLES.SECRETARY]: "מזכירה",
  [USER_ROLES.SYSTEM_ADMIN]: "הנהלה / מנהל מערכת",
  [USER_ROLES.PROJECT_MANAGER]: "מנהל פרויקט",
  [USER_ROLES.PURCHASING_EXECUTION_MANAGER]: "מנהל רכש וביצוע",
};

export const USER_ROLE_PLURAL_LABELS: Record<UserRoleType, string> = {
  [USER_ROLES.FINANCE]: "כספים",
  [USER_ROLES.ENGINEER]: "הנדסה",
  [USER_ROLES.INSTALLER]: "מתקינים",
  [USER_ROLES.SECRETARY]: "מזכירות",
  [USER_ROLES.SYSTEM_ADMIN]: "הנהלה",
  [USER_ROLES.PROJECT_MANAGER]: "מנהלי פרויקטים",
  [USER_ROLES.PURCHASING_EXECUTION_MANAGER]: "מנהלי רכש וביצוע",
};
