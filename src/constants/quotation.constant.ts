export const QUOTATION = {
  STATUS: { DRAFT: "draft", REVIEW: "review", APPROVED: "approved" },
  SYSTEM: { VRF: "VRF", MULTI: "MULTI", SINGLE: "SINGLE", GENERAL: "GEN" },
  CATALOGUE: { ACTIVE: "active", ARCHIVED: "archived", NO_SELL: "nosell", CONFLICT: "conflict" },
  ROLE: {
    INDOOR: "indoor",
    OUTDOOR: "outdoor",
    UNIT: "unit",
    CONTROL: "control",
    HEADER: "header",
    PIPE: "pipe",
    OTHER: "other",
  },
  PATH: "/quotation",
  CATALOGUE_PATH: "/catalogue-item",
  RULE_PATH: "/quotation-rule",
  BRAND: "אלקטרה",
  OTHER_BRAND: "תדיראן",
} as const;
export type QuotationStatusType = (typeof QUOTATION.STATUS)[keyof typeof QUOTATION.STATUS];
export type QuotationSystemType = (typeof QUOTATION.SYSTEM)[keyof typeof QUOTATION.SYSTEM];
export type CatalogueStatusType = (typeof QUOTATION.CATALOGUE)[keyof typeof QUOTATION.CATALOGUE];
export const QUOTATION_PERMISSIONS = {
  READ: "quotations.read",
  CREATE: "quotations.create",
  UPDATE: "quotations.update",
  APPROVE: "quotations.approve",
  CATALOGUE_MANAGE: "catalogue.manage",
} as const;
export const QUOTATION_DUPLICATE_SKUS = [
  "ELVICCI-180A/WS",
  "PEFY-P40VMX-E1",
  "SUN 10 DUCT",
  "SUN 13 DUCT",
  "SUN 19 DUCT",
];
