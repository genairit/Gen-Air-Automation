import { PAYMENT_TERMS } from "./domain.constant.ts";
import { PAYMENT_DEFAULT_OPTIONS } from "./payment-default.constant.ts";

export const CUSTOMER_PAYMENT_FIXED_OPTIONS = PAYMENT_DEFAULT_OPTIONS.filter(
  option => option.value !== PAYMENT_TERMS.OTHER,
);

export const CUSTOMER_PAYMENT_SCHEDULE = {
  FIRST: [
    { percent: "33.3333", text: "אישור והזמנת ציוד" },
    { percent: "66.6667", text: "השלמת ההתקנה" },
  ],
  REPLACEMENT: [
    { percent: "25", text: "תחילת העבודה" },
    { percent: "75", text: "בדיקה ומסירה" },
  ],
  QUOTE_OVERRIDE: [{ percent: "100", text: "הסכם ייחודי להצעה" }],
  NOTE: "הערה עצמאית להצעה שאסור להחליף",
} as const;

export const CUSTOMER_PAYMENT_COPY = {
  OTHER: PAYMENT_DEFAULT_OPTIONS[0].label,
  CANCEL: "ביטול",
  REMOVE: "הסר שלב",
  CUSTOM: "מותאם אישית",
  PERCENT: "אחוז מהסכום",
  MILESTONE: "מועד / אבן דרך",
  ADD_STAGE: "הוסף שלב תשלום",
  APPLY: "החלפת תנאי התשלום בתנאי הלקוח",
  CONFIRM_PRESET: "מחק שלבים ובחר תנאים",
  CONFIRM_CLEAR: "מחק שלבים ונקה תנאים",
  CONFLICT: "יש לבחור בין תנאי תשלום קבועים לשלבי תשלום.",
  INVALID: "יש לתאר כל שלב ולהשלים אחוזים תקינים לסכום של 100%.",
  LEGACY: "מותאם אישית — טרם הוגדרו שלבי תשלום",
  NO_DEFAULT: "לא הוגדרו תנאי תשלום ללקוח; תנאי ההצעה נשארו ללא שינוי.",
  RETRY: "נסה שוב",
} as const;
