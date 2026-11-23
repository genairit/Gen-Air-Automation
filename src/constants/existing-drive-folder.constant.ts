export const EXISTING_DRIVE_COPY = {
  GROUP: "תיקיית Google Drive",
  NEW: "יצירת תיקייה חדשה",
  EXISTING: "קישור לתיקייה קיימת",
  INPUT: "קישור או מזהה תיקיית Google Drive",
  CHECKED: "התיקייה נבדקה ותקושר לפרויקט",
  LINKED: "תיקייה קיימת מקושרת",
  MISSING: "מבנה התיקיות אינו מלא",
  COMPLETE: "השלם תיקיות חסרות",
  RETRY: "נסה לבדוק שוב",
  NOT_FOUND:
    "התיקייה לא נמצאה, נמצאת באשפה או שאין למערכת גישה אליה. בדוק את הקישור והרשאות השיתוף.",
} as const;

export const EXISTING_DRIVE_ERROR_CODES = {
  REFERENCE_INVALID: "DRIVE_FOLDER_REFERENCE_INVALID",
  NOT_ACCESSIBLE: "DRIVE_FOLDER_NOT_ACCESSIBLE",
  REQUIRED: "DRIVE_FOLDER_REQUIRED",
  OUTSIDE_COMPANY: "DRIVE_FOLDER_OUTSIDE_COMPANY",
  ALREADY_LINKED: "DRIVE_FOLDER_ALREADY_LINKED",
  OWNERSHIP_OVERLAP: "DRIVE_FOLDER_OWNERSHIP_OVERLAP",
  APARTMENT_LOCATION_INVALID: "DRIVE_FOLDER_APARTMENT_LOCATION_INVALID",
  TEMPLATE_AMBIGUOUS: "DRIVE_FOLDER_TEMPLATE_AMBIGUOUS",
} as const;
