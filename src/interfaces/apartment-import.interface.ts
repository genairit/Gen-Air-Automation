export type TImportCounts = Record<string, number>;

export interface IImportResult {
  rows: unknown[];
  counts: TImportCounts;
  reportBase64: string | null;
}

export interface IImportedApartment {
  id: string;
  customerId: string;
  customerApartment: string;
  apartmentCredit: string | null;
  apartmentOwnership: string | null;
}
