export const MATERIAL_STATUS = { ACTIVE: "active", INACTIVE: "inactive" } as const;

export const MATERIAL_BASIS = {
  FIXED: "fixed",
  PROJECT_MEASUREMENT: "project_measurement",
} as const;

export const PURCHASE_STATUS = {
  DRAFT: "draft",
  REQUESTED: "requested",
  REVIEWED: "reviewed",
  APPROVED: "approved",
  ORDERED: "ordered",
  CANCELLED: "cancelled",
} as const;
