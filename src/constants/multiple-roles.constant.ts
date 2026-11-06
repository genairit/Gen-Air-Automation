export const MULTIPLE_ROLES_COPY = {
  EDIT: "עריכת עובד",
  SAVE: "שמירת שינויים",
  ACTIVE_ROLE: "תפקיד פעיל",
  EDIT_TITLE: "עריכת תפקידים והרשאות",
  REQUIRED: "יש לבחור לפחות תפקיד אחד",
  CONTEXT_CHANGED: "הרשאות החשבון השתנו בזמן הפעולה.",
} as const;

export const ROLE_AUDIT_ACTIONS = {
  ASSIGNMENT: "assignment",
  SWITCH: "switch",
} as const;

export type RoleAuditActionType = (typeof ROLE_AUDIT_ACTIONS)[keyof typeof ROLE_AUDIT_ACTIONS];
