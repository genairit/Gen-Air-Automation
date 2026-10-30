import { TASK_LINK_KINDS, type TaskLinkKindType } from "./domain.constant.ts";

const SHARED_COPY = {
  DETAIL_SEPARATOR: "·",
  INFO_ONLY: "מידע בלבד",
  ADD_APARTMENT: "הוסף דירה",
  PROJECT_CUSTOMER: "לקוח הפרויקט",
  PERSON_NAME_PLACEHOLDER: "ישראל ישראלי",
  MOBILE_PHONE_PLACEHOLDER: "052-1234567",
  TASK_DESCRIPTION_PLACEHOLDER: "פרט מה צריך לעשות, מה כבר ידוע ומה מצופה כתוצאה",
} as const;

export const LOGIN_COPY = {
  TITLE: "התחברות למערכת",
  SUBMIT: "התחבר למערכת",
  EMAIL_PLACEHOLDER: "name@genair.co.il",
} as const;

export const NAVIGATION_COPY = {
  TASKS: "משימות",
  LOGOUT: "התנתק",
  BOARD: "לוח בקרה",
  SETTINGS: "הגדרות",
  CUSTOMERS: "לקוחות",
  EMPLOYEES: "ניהול עובדים",
} as const;

export const BOARD_COPY = {
  NEW_TASK: "משימה חדשה",
  NEW_PROJECT: "פרויקט חדש",
  TITLE: "ניהול פרויקטים ומשימות",
  SEARCH_PLACEHOLDER: "חיפוש פרויקטים, מזהה או קבלן...",
} as const;

export const CUSTOMERS_COPY = {
  PENDING_TAB: "ממתין",
  NEXT_PAGE: "העמוד הבא",
  NEW_CUSTOMER: "לקוח חדש",
  PREVIOUS_PAGE: "העמוד הקודם",
  DETAILS_TITLE: "פרטי הלקוח",
  BACK_TO_CUSTOMERS: "חזרה ללקוחות",
  PENDING_SYNC: "ממתין ל-Priority",
  CREATE_DENIED: "אין הרשאה ליצירת לקוחות",
  MANAGERS_ONLY: "רק מנהלים עם הרשאת ניהול לקוחות יכולים ליצור לקוחות",
  SEARCH_PLACEHOLDER: "חיפוש לפי שם, ח.פ, איש קשר, טלפון או מזהה Priority...",
} as const;

export const CUSTOMER_FORM_COPY = {
  CANCEL: "ביטול",
  EYEBROW: "לקוחות",
  TITLE: "לקוח חדש",
  SAVE: "שמור לקוח",
  TYPE: "סוג הלקוח",
  SUMMARY: "מה יישמר",
  REQUIRED: "שדה חובה",
  IDENTITY: "זהות הלקוח",
  CONTACT: "איש קשר ראשי",
  CONFLICT_STATUS: "הפעולה מתנגשת בנתונים קיימים",
  DUPLICATE_TAX_ID: "לקוח עם מספר מזהה זה כבר קיים",
  FIELDS: {
    PHONE: "טלפון",
    EMAIL: "דוא״ל",
    ADDRESS: "כתובת",
    NAME: "שם הלקוח",
    TAX_ID: "ח.פ / ת.פ / ת.ז",
    CONTACT_NAME: "איש קשר ראשי",
  },
} as const;

export type CustomerFieldType = keyof typeof CUSTOMER_FORM_COPY.FIELDS;

export const CUSTOMER_FIELD_NAMES: CustomerFieldType[] = [
  "NAME",
  "TAX_ID",
  "ADDRESS",
  "CONTACT_NAME",
  "PHONE",
  "EMAIL",
];

export const CUSTOMER_IDENTITY_FIELD_NAMES: CustomerFieldType[] = ["NAME", "TAX_ID", "ADDRESS"];

export const CUSTOMER_CONTACT_FIELD_NAMES: CustomerFieldType[] = ["CONTACT_NAME", "PHONE", "EMAIL"];

export const CUSTOMER_FIELD_PLACEHOLDERS: Record<CustomerFieldType, string> = {
  TAX_ID: "9 ספרות",
  ADDRESS: "רחוב ומספר, עיר",
  EMAIL: "name@company.co.il",
  NAME: "בבלי נדל״ן ופיתוח בע״מ",
  CONTACT_NAME: SHARED_COPY.PERSON_NAME_PLACEHOLDER,
  PHONE: SHARED_COPY.MOBILE_PHONE_PLACEHOLDER,
};

export const CUSTOMER_FIELD_HINTS = {
  TAX_ID: "9 ספרות, נבדק מול ספרת ביקורת",
  PHONE: "נייד או קווי, עם או בלי מקף",
} as const;

export const CUSTOMER_TYPE_LABELS = {
  COMPANY: "חברה",
  INSTITUTION: "מוסד",
  PRIVATE_CLIENT: "לקוח פרטי",
} as const;

export const CUSTOMER_SUMMARY_LABELS = {
  CREATED_BY: "נוצר ע״י",
  PRIORITY_ID: "מזהה Priority",
  SYNC_STATUS: "סטטוס סנכרון",
} as const;

export const CUSTOMER_SUMMARY_VALUES = {
  PRIORITY_ID: "יוקצה כשהסנכרון עם Priority יופעל",
  SYNC_STATUS: "ממתין ל-Priority · אין סנכרון אוטומטי",
} as const;

export const TASKS_COPY = {
  REMOVED_MANAGERS_NOTE: "הקצאת משימות למנהלים בלבד",
  NEW_TASK: "משימה חדשה",
  CREATE_DENIED: "אין הרשאה להקצאת משימות",
} as const;

export const EMPLOYEES_COPY = {
  ROLE_LABEL: "תפקיד והרשאה",
  DELETE_EMPLOYEE: "מחיקת עובד",
  NAME_PLACEHOLDER: "לדוגמה: יובל אל",
  PHONE_PLACEHOLDER: "0500000000",
  ADD_EMPLOYEE: "הוסף עובד למערכת",
  EMAIL_PLACEHOLDER: "yuval@genair.co.il",
  SEARCH_PLACEHOLDER: "חיפוש עובד לפי שם, מייל, טלפון או תפקיד...",
} as const;

export const SETTINGS_COPY = {
  UPDATE_PASSWORD: "עדכן סיסמה",
  STAGES_TITLE: "סטטוסי פרויקט קבועים",
  PASSWORD_UPDATED: "הסיסמה עודכנה בהצלחה",
  NEW_PASSWORD_PLACEHOLDER: "הזן סיסמה חדשה",
  CONFIRM_PASSWORD_PLACEHOLDER: "חזור על הסיסמה",
} as const;

export const PROJECT_FORM_COPY = {
  DISCARD_DRAFT: "מחק טיוטה והתחל מחדש",
  SAVE: "שמור שינויים",
  CREATE: "צור פרויקט",
  DELETE: "מחק פרויקט",
  ROLES_TITLE: "הקצאת תפקידים וצוות",
  DRAFT_RESTORED: "טיוטת הפרויקט שוחזרה",
  CREATE_DENIED: "אין הרשאה ליצירת פרויקטים",
  EDIT_DENIED: "אין הרשאה לעריכת פרויקטים",
  ADDRESS: "כתובת הפרויקט",
  NAME: "שם הפרויקט / כותרת הנדסית",
  ADDRESS_VERIFIED: "כתובת מאומתת ע״י Google Maps",
  CONTACT_NAME_PLACEHOLDER: SHARED_COPY.PERSON_NAME_PLACEHOLDER,
  CONTACT_PHONE_PLACEHOLDER: SHARED_COPY.MOBILE_PHONE_PLACEHOLDER,
  CUSTOMER_SEARCH_PLACEHOLDER: "חיפוש לקוח לפי שם, ח.פ, איש קשר או טלפון...",
} as const;

export const PROJECT_PAGE_COPY = {
  STAGE_PREFIX: "שלב:",
  EDIT: "עריכת פרויקט",
  NEW_TASK: "+ משימה חדשה",
  NOT_FOUND: "הפרויקט לא נמצא",
  ADD_APARTMENT: SHARED_COPY.ADD_APARTMENT,
  TEAM_TITLE: "צוות הפרויקט המוקצה",
  BUILDING_INHERITED: "נתונים שעוברים לכל הדירות",
  FOLDERS_TITLE: "מבנה תיקיות ומסמכי פרויקט",
  TIMELINE_TITLE: "ציר זמן והיסטוריית סטטוס",
  APARTMENT_SEARCH_PLACEHOLDER: "חיפוש לפי מספר דירה, לקוח או קוד...",
} as const;

export const DRIVE_COPY = {
  SUBTITLE: "לחיצה על שם הקובץ פותחת אותו ב-Google Drive",
  OPEN_FOLDER: "פתח תיקייה ב-Drive",
  PREPARE_FOLDER: "צור תיקיית פרויקט",
  PREPARING_FOLDER: "מכין את תיקיית הפרויקט…",
  MISSING_TITLE: "תיקיית הפרויקט עדיין לא נוצרה",
  READ_ONLY: "פנו למנהל הפרויקט כדי ליצור את התיקייה.",
  AUTHENTICATION_FAILED: "החיבור ל-Google Drive אינו מוגדר כראוי. פנו למנהל המערכת.",
  PROVISION_FAILED: "לא ניתן ליצור את התיקייה כרגע. בדקו את החיבור ל-Google Drive ונסו שוב.",
  RETRY: "נסה שוב",
  EMPTY_FOLDER: "התיקייה ריקה",
  FOLDER_HAS_FILES: "יש קבצים בתיקייה",
  UNAVAILABLE_TITLE: "Google Drive אינו זמין כרגע",
  UNSUPPORTED_FILE: "סוג הקובץ אינו נתמך או ששם הקובץ אינו תקין.",
} as const;

export const APARTMENT_COPY = {
  FLOOR: "קומה",
  APARTMENT: "דירה",
  BUILDING_PREFIX: "בניין",
  NUMBER: "מספר דירה",
  SAVE_NOTES: "שמור הערות",
  NEXT: "‹ דירה הבאה",
  ADD: SHARED_COPY.ADD_APARTMENT,
  CONTACT_NAME: "איש קשר: שם מלא",
  CONTACT_PHONE: "איש קשר: טלפון נייד",
  NOTES_PLACEHOLDER: "לדוגמה: הדייר זמין רק אחר הצהריים, גישה דרך חדר המדרגות המזרחי",
} as const;

export const TASK_COPY = {
  URGENT_TAB: "דחופות",
  ASSIGNEE: "אחראי",
  HISTORY_TITLE: "היסטוריית סטטוס",
  CLAIM: "משוך אליי",
  SAVE_DESCRIPTION: "שמור תיאור",
  MARK_URGENT: "סמן כדחופה…",
  URGENT_TITLE: "משימה דחופה",
  CONFIRM_URGENT: "סמן כדחופה",
  DESCRIPTION_PLACEHOLDER: SHARED_COPY.TASK_DESCRIPTION_PLACEHOLDER,
  SEARCH_PLACEHOLDER: "חיפוש במשימות שלי לפי משימה, פרויקט או לקוח...",
  PROJECT_CUSTOMER: [
    SHARED_COPY.PROJECT_CUSTOMER,
    SHARED_COPY.DETAIL_SEPARATOR,
    SHARED_COPY.INFO_ONLY,
  ].join(" "),
} as const;

export const TASK_FORM_COPY = {
  SAVE: "שמור משימה",
  DUE_DATE: "תאריך יעד",
  ASSIGNEE_PLACEHOLDER: "בחר...",
  TITLE_PLACEHOLDER: "לדוגמה: תיאום ביקור באתר",
  DESCRIPTION_PLACEHOLDER: SHARED_COPY.TASK_DESCRIPTION_PLACEHOLDER,
} as const;

export const TASK_LINK_COPY = {
  UNDO: "בטל",
  DISMISS: "סגור",
  RETRY: "נסה שוב",
  INFO_ONLY: SHARED_COPY.INFO_ONLY,
  DETAIL_SEPARATOR: SHARED_COPY.DETAIL_SEPARATOR,
  KIND_GROUP: "המשימה קשורה ל...",
  NEW_CUSTOMER: "צור לקוח חדש",
  PROJECT_CUSTOMER: `${SHARED_COPY.PROJECT_CUSTOMER}:`,
  PROJECT_CUSTOMER_NOTE: "לא נשמר כשיוך נוסף למשימה",
  NO_KIND: "בחר לקוח או פרויקט כדי לשייך את המשימה",
  KIND_REQUIRED: "בחר אם המשימה קשורה ללקוח או לפרויקט",
} as const;

export const TASK_LINK_KIND_COPY = {
  [TASK_LINK_KINDS.CUSTOMER]: {
    LABEL: "לקוח",
    REQUIRED: "בחר לקוח",
    LINKED_TO: "משויכת ללקוח",
    REPLACE: "החלף לקוח",
    LOADING: "טוען לקוחות…",
    SELECTED_LOADING: "טוען את הלקוח שנבחר…",
    SELECTED_ERROR: "לא הצלחנו לטעון את הלקוח שנבחר",
    EMPTY: "לא נמצא לקוח שמתאים לחיפוש",
    ERROR: "לא הצלחנו לטעון את רשימת הלקוחות",
    SEARCH_PLACEHOLDER: "חיפוש לקוח לפי שם או מזהה...",
  },
  [TASK_LINK_KINDS.PROJECT]: {
    LABEL: "פרויקט",
    REQUIRED: "בחר פרויקט",
    LINKED_TO: "משויכת לפרויקט",
    REPLACE: "החלף פרויקט",
    LOADING: "טוען פרויקטים…",
    SELECTED_LOADING: "טוען את הפרויקט שנבחר…",
    SELECTED_ERROR: "לא הצלחנו לטעון את הפרויקט שנבחר",
    EMPTY: "לא נמצא פרויקט שמתאים לחיפוש",
    ERROR: "לא הצלחנו לטעון את רשימת הפרויקטים",
    SEARCH_PLACEHOLDER: "חיפוש פרויקט לפי שם או מזהה...",
  },
} as const satisfies Record<TaskLinkKindType, Record<string, string>>;
