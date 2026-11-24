import type { TGenAirApi } from "../api/gen-air-api.ts";
import type { IQuotationDocument } from "./quotation.interface.ts";
import type { QuotationStatusType } from "../constants/quotation.constant.ts";

export type TFilenameRecord = Record<string, unknown>;

export interface IStoredFilenameSnapshot {
  rootId: string;
  projectId: string;
  sourceHash: string;
  sourceVersion: number;
  snapshot: TFilenameRecord;
  rootContext: TFilenameRecord;
}

export interface IFilenameSnapshotRow extends Omit<
  IStoredFilenameSnapshot,
  "snapshot" | "rootContext"
> {
  snapshot: unknown;
  rootContext: unknown;
}

export interface ILegacyFilenameSeed {
  id: string;
  projectCode: string;
  historicalFilename: string;
  stored: IStoredFilenameSnapshot;
}

export interface IFilenameQuotationTransition {
  api: TGenAirApi;
  status: QuotationStatusType;
  quotation: IQuotationDocument;
}
