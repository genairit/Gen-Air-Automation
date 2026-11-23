import type { QuotationStatusType } from "../constants/quotation.constant.ts";
import type { QuotationLifecycleActionType } from "../constants/quotation-lifecycle.constant.ts";

export interface IQuotationLifecycleEvent {
  id: string;
  actorId: string;
  actorName: string;
  occurredAt: string;
  quotationId: string;
  reason: string | null;
  quotationVersion: number;
  toStatus: QuotationStatusType;
  fromStatus: QuotationStatusType;
  action: QuotationLifecycleActionType;
}
