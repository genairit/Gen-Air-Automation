export const PROJECT_CONTACT_ROLES = {
  ARCHITECT: "architect",
  PROJECT_MANAGER: "project_manager",
  CONSULTANT: "consultant",
} as const;

export type ProjectContactRoleType =
  (typeof PROJECT_CONTACT_ROLES)[keyof typeof PROJECT_CONTACT_ROLES];

export const PROJECT_CONTACT_ROLE_LABELS = {
  architect: "אדריכל",
  project_manager: "מנהל פרויקט",
  consultant: "יועץ",
} as const;

export const PROJECT_CONTACT_ROLE_COPY = {
  EMPTY: "לא שויך איש קשר",
  SECTION: "אנשי קשר בפרויקט או בדירה",
  CREATE_SECTION: "אנשי קשר בפרויקט",
  SHARED_EDIT: "שינוי הפרטים יעודכן גם בפרויקטים אחרים המשתמשים באיש הקשר",
} as const;
