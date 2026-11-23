export const QUOTATION_LIFECYCLE = {
  SUBMIT: "submit",
  APPROVE: "approve",
  RETURN: "return",
  REJECT: "reject",
  RESUBMIT: "resubmit",
  CANCEL: "cancel",
  RESTORE: "restore",
} as const;

export type QuotationLifecycleActionType =
  (typeof QUOTATION_LIFECYCLE)[keyof typeof QUOTATION_LIFECYCLE];

export const LIFECYCLE_COPY = {
  BACK: "חזרה",
  RETURN: "החזרה לעריכה",
  CONFIRM_RETURN: "החזר לעריכה",
  REJECT: "דחייה עם סיבה",
  REJECT_TITLE: "דחיית הצעה והחזרה לתיקון",
  CONFIRM_REJECT: "דחה והחזר לתיקון",
  REASON: "סיבת דחייה",
  HISTORY: "היסטוריית המסמך",
  RELOAD: "טען גרסה עדכנית",
  LOADED: "הגרסה העדכנית נטענה",
  UNCERTAIN: "תוצאת הפעולה אינה ודאית",
  CHANGED: "מצב המסמך השתנה",
  FORBIDDEN: "אין הרשאה לביצוע הפעולה",
} as const;

export const LIFECYCLE_DIALOG_SCENARIOS = {
  RETURN: {
    endpoint: "review",
    action: QUOTATION_LIFECYCLE.RETURN,
    title: LIFECYCLE_COPY.RETURN,
    trigger: LIFECYCLE_COPY.RETURN,
    confirm: LIFECYCLE_COPY.CONFIRM_RETURN,
  },
  REJECT: {
    endpoint: "reject",
    action: QUOTATION_LIFECYCLE.REJECT,
    title: LIFECYCLE_COPY.REJECT_TITLE,
    trigger: LIFECYCLE_COPY.REJECT,
    confirm: LIFECYCLE_COPY.CONFIRM_REJECT,
  },
} as const;

export const LIFECYCLE_REASON_FIXTURES = {
  SINGLE_CHARACTER: "א",
  LONG_MIXED_TEXT: "נדרש תיקון הנדסי ושמירה על היסטוריית המסמך. QA-185 2026 (בדיקה)! ".repeat(12),
} as const;
