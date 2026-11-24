import { TIME_UNITS } from "./time.constant.ts";

const DEBOUNCE_MS = 0.3 * TIME_UNITS.SECOND_MS;

export const CONTACT_SEARCH = {
  DEBOUNCE_MS,
  CLOCK_PAUSE_LEAD_MS: 5 * TIME_UNITS.SECOND_MS,
  FINAL_DEBOUNCE_MS: TIME_UNITS.MILLISECOND_MS,
  BEFORE_DEBOUNCE_MS: DEBOUNCE_MS - TIME_UNITS.MILLISECOND_MS,
  SETTLE_MS: 2 * DEBOUNCE_MS,
  ROUTE: "**/contact-directory**",
  ENDPOINT: "/contact-directory",
  INPUT: "חיפוש איש קשר קיים במדריך",
  EMPTY: "הקלידו שם, טלפון או דוא״ל לחיפוש איש קשר",
  NO_RESULTS: "לא נמצאו אנשי קשר מתאימים",
  RETRY: "נסה שוב",
  ADDITIONAL: "אנשי קשר נוספים",
  CREATE: "צור איש קשר במדריך",
  EDIT: "ערוך איש קשר",
  SAVE: "שמירה",
  LINK: "שייך",
  NAME: "שם",
  PHONE: "טלפון",
  CANCEL: "ביטול",
  REMOVE: "הסר בחירה",
  FAILED_SAVE: "Contact save temporarily failed",
  FAILED_SEARCH: "Contact lookup temporarily failed",
  LONG_FAILED_SEARCH:
    "לא ניתן לחפש אנשי קשר כרגע. בדיקת שגיאה ארוכה בממשק הנייד עם כתובת טכנית לצורך אימות גלישת שורות: " +
    "contact-directory-temporary-failure-".repeat(5),
} as const;
