export const SEED_VALUES = {
  DUE_DATE: "2030-12-31",
  APARTMENT_FLOOR: 3,
  CUSTOMER_PHONE: "03-1234567",
  PROJECT_CONTACT_NAME: "דנה כהן",
  APARTMENT_CONTACT_NAME: "רון לוי",
  EMPLOYEE_LAST_NAME: "בדיקה",
  CUSTOMER_ADDRESS: "הרצל 12 תל אביב",
  CUSTOMER_CONTACT_NAME: "ישראל ישראלי",
  TASK_DESCRIPTION: "תיאור משימת אוטומציה",
} as const;

export const SEED_NAME_PREFIXES = {
  TASK: "משימת אוטומציה",
  EMPLOYEE: "עובד",
  PROJECT: "פרויקט אוטומציה",
  CUSTOMER: "לקוח אוטומציה",
} as const;

export const SEED_EMAIL_PREFIXES = {
  EMPLOYEE: "employee",
  CUSTOMER: "customer",
} as const;
