import { PAYMENT_TERMS } from "./domain.constant.ts";
import { escapeRegex } from "../utilities/regex.utility.ts";

export const PAYMENT_DEFAULT_COPY = {
  NONE: "ללא ברירת מחדל",
  CREATE: "תנאי תשלום כברירת מחדל",
  EDIT: "תנאי תשלום",
  SAVE: "שמירת ברירת מחדל",
  SAVED: "ברירת המחדל נשמרה",
  QUOTE_NOTE: "הערה לתנאי התשלום (להצעה זו בלבד)",
  NEW_QUOTE: "הצעה חדשה",
  CREATE_QUOTE: "יצירת הצעה",
  QUOTE_CUSTOMER: "לקוח *",
  RETIRED_PLACEHOLDER: "בחר תנאי תשלום…",
} as const;

export const PAYMENT_DEFAULT_PATTERNS = {
  NOTE: /הערה.*תשלום/,
  SECTION: new RegExp(escapeRegex(PAYMENT_DEFAULT_COPY.EDIT)),
} as const;

export const PAYMENT_DEFAULT_NONE_OPTION = {
  value: null,
  label: PAYMENT_DEFAULT_COPY.NONE,
} as const;

export const PAYMENT_DEFAULT_OPTIONS = [
  { value: PAYMENT_TERMS.OTHER, label: "אחר" },
  { value: PAYMENT_TERMS.PREPAID, label: "תשלום מראש" },
  { value: PAYMENT_TERMS.MILESTONES_NET_60, label: "לפי אבני דרך (שוטף + 60)" },
  { value: PAYMENT_TERMS.INSTALLMENTS_10_60_30, label: "10-60-30" },
  { value: PAYMENT_TERMS.TWELVE_PREPAID_CHECKS, label: "12 צ׳קים מראש" },
] as const;

export const RETIRED_PROJECT_PAYMENT_FIELDS = [
  "paymentTerms",
  "paymentTermsNote",
  "hasOwnPaymentTerms",
] as const;

export const RETIRED_PROJECT_DRAFT_PAYMENT_FIELDS = ["terms", "termsNote"] as const;
