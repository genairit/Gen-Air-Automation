import type { TaskLinkKindType } from "../constants/domain.constant.ts";
import { TASK_LINK_COPY, TASK_LINK_KIND_COPY } from "../constants/copy.constant.ts";

export const formatFieldErrorCount = (count: number): string =>
  `יש ${count} שדות לתיקון לפני השמירה`;

export const formatClearedLinkNotice = (kind: TaskLinkKindType, name: string): string =>
  `השיוך הקודם (${TASK_LINK_KIND_COPY[kind].LABEL}: ${name}) נוקה`;

export const formatProjectCustomerNote = (customerName: string): string =>
  `${TASK_LINK_COPY.PROJECT_CUSTOMER} ${customerName} · ${TASK_LINK_COPY.PROJECT_CUSTOMER_NOTE}`;

export const formatProjectCustomerContext = (customerName: string): string => `· ${customerName}`;
