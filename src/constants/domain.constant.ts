export const PROJECT_TYPE_NAMES = {
  INSTITUTION: "מוסד",
  LUXURY_APARTMENT: "דירות יוקרה",
  PRIVATE_CLIENT: "לקוחות פרטיים",
  RESIDENTIAL_BUILDING: "בנייה רוויה",
  COMMERCIAL: "מסחרי (VRF / צ׳ילרים)",
} as const;

export type ProjectTypeNameType = (typeof PROJECT_TYPE_NAMES)[keyof typeof PROJECT_TYPE_NAMES];

export const CUSTOMER_TYPES = {
  COMPANY: "company",
  INSTITUTION: "institution",
  PRIVATE_CLIENT: "private_client",
} as const;

export const CUSTOMER_LIST_PAGING = {
  PAGE_SIZE: 7,
  OVERFLOWING_PAGE_COUNT: 8,
} as const;

export const PAYMENT_TERMS = {
  MILESTONES_NET_60: "milestones_net_60",
} as const;

export const PAYMENT_TERMS_LABELS = {
  MILESTONES_NET_60: "לפי אבני דרך (שוטף + 60)",
} as const;

export const CONTACT_ROLES = {
  ENGINEER: "מהנדס",
  PROJECT_MANAGER: "מנהל פרויקט",
} as const;

export const PROJECT_STATUS_NAMES = {
  DONE: "הסתיים",
  ON_HOLD: "להמתין",
  PENDING: "ממתין",
  IN_PROGRESS: "בעבודה",
} as const;

export const TASK_STATUS_NAMES = {
  IN_REVIEW: "בבדיקה",
  IN_PROGRESS: "בעבודה",
  QUOTE_SENT: "נשלחה הצעה",
  NOT_STARTED: "טרם בעבודה",
  WAITING_FOR_REPLY: "מחכה לתשובה",
} as const;

export const DRIVE_CONTENT_STATUSES = {
  EMPTY: "empty",
  HAS_CONTENT: "has_content",
} as const;

export const MIME_TYPES = {
  PDF: "application/pdf",
  BINARY: "application/octet-stream",
} as const;

export const TASK_STATUSES = {
  IN_REVIEW: "in_review",
  IN_PROGRESS: "in_progress",
  NOT_STARTED: "not_started",
  PROPOSAL_SENT: "proposal_sent",
  WAITING_FOR_RESPONSE: "waiting_for_response",
} as const;

export type TaskStatusType = (typeof TASK_STATUSES)[keyof typeof TASK_STATUSES];

export const TASK_LINK_KINDS = {
  CUSTOMER: "CUSTOMER",
  PROJECT: "PROJECT",
} as const;

export type TaskLinkKindType = (typeof TASK_LINK_KINDS)[keyof typeof TASK_LINK_KINDS];

export const CUSTOMER_SYNC_STATUSES = {
  FAILED: "failed",
  SYNCED: "synced",
  PENDING: "pending",
} as const;

export type CustomerSyncStatusType =
  (typeof CUSTOMER_SYNC_STATUSES)[keyof typeof CUSTOMER_SYNC_STATUSES];
