import { PROJECT_STATUS_NAMES } from "./domain.constant.ts";

export const PROJECT_STATUS_IDS = {
  WAITING_RESPONSE: "6502a045-2a7d-4bc8-8ba1-36eaedc49a06",
  ARCHIVED_ON_HOLD: "6502a045-2a7d-4bc8-8ba1-36eaedc49a03",
} as const;

export const ARCHIVED_ON_HOLD_STAGE_NAME = "להמתין";

export const STAGE_NOTE_MAX_LENGTH = 255;

export const WAITING_REASON_ERROR = {
  CODE: "WAITING_REASON_REQUIRED",
  MESSAGE: `יש להזין סיבה למעבר לסטטוס "${PROJECT_STATUS_NAMES.WAITING_RESPONSE}"`,
} as const;

export const STAGE_REASON_COPY = {
  TITLE: `העברה לשלב ״${PROJECT_STATUS_NAMES.WAITING_RESPONSE}״`,
  LABEL: "סיבת ההמתנה",
  CONFIRM: "אישור והעברה",
  CANCEL: "ביטול",
  CLOSE: "סגירה",
  REQUIRED_ERROR: "יש להזין סיבה להמתנה",
  PROJECT_CONTEXT: "יש לפרט למה או למי הפרויקט ממתין. הסיבה תוצג בעמוד הפרויקט ובציר הזמן.",
  APARTMENT_CONTEXT: "יש לפרט למה או למי הדירה ממתינה. הסיבה תוצג בעמוד הדירה ובציר הזמן.",
  BANNER_TITLE: "סיבת ההמתנה",
  BANNER_EMPTY: "לא תועדה סיבה",
  TIMELINE_LABEL: "סיבה:",
  ARCHIVED_STAGE: "שלב בארכיון",
} as const;

export const BULK_STAGE_COPY = {
  CHANGE_STAGE: "שנה שלב ל…",
  SELECTED_SUFFIX: "דירות נבחרו",
} as const;

export const PROJECT_EDIT_STATUS_LABEL = "סטטוס פרויקט";

export const formatBulkReasonTitle = (count: number) =>
  `העברת ${count} דירות לשלב ״${PROJECT_STATUS_NAMES.WAITING_RESPONSE}״`;

export const formatBulkReasonContext = (count: number) =>
  `הסיבה תישמר עבור כל ${count} הדירות שנבחרו ותוצג בציר הזמן של כל דירה.`;

export const formatSelectApartmentLabel = (apartmentNumber: string) =>
  `בחר דירה ${apartmentNumber}`;

export const formatCharacterCounter = (length: number) => `${length}/${STAGE_NOTE_MAX_LENGTH}`;
