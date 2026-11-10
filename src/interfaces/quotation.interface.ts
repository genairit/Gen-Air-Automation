import type {
  CatalogueStatusType,
  QuotationStatusType,
  QuotationSystemType,
  QuotationCancellationKindType,
  QuotationRestorableStatusType,
} from "../constants/quotation.constant.ts";

export interface ICatalogueFixture {
  id: string;
  sku: string;
  unit: string;
  price: string;
  brand: string;
  preference: string;
  description: string;
  equipmentRole: string;
  includesRemote: boolean;
  equipmentTypes: string[];
  capacityBtu: number | null;
  status: CatalogueStatusType;
  includesThermostat: boolean;
  systemType: QuotationSystemType | null;
}
export interface IQuotationLine {
  id: string;
  sku: string;
  unit: string;
  quantity: string;
  location: string;
  quotedPrice: string;
  description: string;
  equipmentRole: string;
  circuit: string | null;
  catalogueItemId: string;
  includesRemote: boolean;
  catalogueStatus: string;
  controlKind: string | null;
  capacityBtu: number | null;
  parentItemId: string | null;
  includesThermostat: boolean;
  requestedCapacityBtu: number | null;
}
export interface IQuotationSection {
  id: string;
  title: string;
  brand: string | null;
  items: IQuotationLine[];
  systemType: QuotationSystemType;
}
export interface IQuotationWarning {
  key: string;
  text: string;
  acknowledged: boolean;
}
export interface IQuotationCancellation {
  reason: string;
  cancelledAt: string;
  cancelledById: string;
  cancelledByName: string;
  restoredAt: string | null;
  restoredById: string | null;
  restoredByName: string | null;
  kind: QuotationCancellationKindType;
  fromStatus: QuotationRestorableStatusType;
}
export interface IQuotationDocument {
  id: string;
  date: string;
  brand: string;
  number: string;
  version: number;
  vatRate: string;
  brands: string[];
  customerId: string;
  internalNotes: string;
  discountPercent: string;
  projectId: string | null;
  paymentTermsNote: string;
  approvedAt: string | null;
  warningScopeVersion: number;
  paymentTerms: string | null;
  approvedById: string | null;
  status: QuotationStatusType;
  ruleConfigFingerprint: string;
  sections: IQuotationSection[];
  warnings: IQuotationWarning[];
  targetPretaxAmount: string | null;
  cancellationHistory: IQuotationCancellation[];
  paymentSchedule: { percent: string; text: string }[];
  cancelledFromStatus: QuotationRestorableStatusType | null;
  totals: { subtotal: string; discount: string; pretax: string; vat: string; total: string };
}
export interface IQuotationWriteLine extends Pick<
  IQuotationLine,
  | "id"
  | "catalogueItemId"
  | "parentItemId"
  | "description"
  | "quotedPrice"
  | "quantity"
  | "location"
  | "circuit"
  | "requestedCapacityBtu"
> {}
export interface IQuotationWriteSection extends Pick<
  IQuotationSection,
  "id" | "title" | "systemType"
> {
  brand?: string | null;
  items: IQuotationWriteLine[];
}
export interface IQuotationWrite extends Pick<
  IQuotationDocument,
  | "version"
  | "customerId"
  | "projectId"
  | "date"
  | "brand"
  | "paymentTerms"
  | "paymentTermsNote"
  | "paymentSchedule"
  | "discountPercent"
  | "targetPretaxAmount"
  | "internalNotes"
> {
  brands?: string[];
  sections: IQuotationWriteSection[];
}
