import type {
  PublicationKindType,
  PublicationStateType,
  PublicationEffectType,
} from "../constants/quotation-publication.constant.ts";

export interface IPublicationSummary {
  canRetry: boolean;
  reason: string | null;
  cycleId: string | null;
  fileUrl: string | null;
  updatedAt: string | null;
  generation: number | null;
  state: PublicationStateType;
  sourceVersion: number | null;
  destinationLabel: string | null;
  history: { [key: string]: unknown }[];
  documentKind: PublicationKindType | null;
}
export interface IPublicationEffect {
  id: string;
  name: string;
  mimeType: string;
  parents: string[];
  md5: string | null;
  cycleId: string | null;
  revisionId: string | null;
  quotationId: string | null;
  action: PublicationEffectType;
}
export interface IPublicationProof {
  lineId: string;
  cycleId: string;
  hash: string | null;
  sourceVersion: number;
  fileId: string | null;
  sourceQuantity: string;
  documentVersion: string;
  documentQuantity: string;
  sourceSnapshotVersion: string;
}
