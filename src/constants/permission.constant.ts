import { QUOTATION_PERMISSIONS } from "./quotation.constant.ts";

export const PERMISSIONS = {
  QUOTATIONS_READ: QUOTATION_PERMISSIONS.READ,
  QUOTATIONS_CREATE: QUOTATION_PERMISSIONS.CREATE,
  QUOTATIONS_UPDATE: QUOTATION_PERMISSIONS.UPDATE,
  QUOTATIONS_DELETE: QUOTATION_PERMISSIONS.DELETE,
  QUOTATIONS_APPROVE: QUOTATION_PERMISSIONS.APPROVE,
  QUOTATIONS_EXPORT: QUOTATION_PERMISSIONS.EXPORT,
  CATALOGUE_MANAGE: QUOTATION_PERMISSIONS.CATALOGUE_MANAGE,
  PROJECTS_READ: "projects.read",
  PROJECTS_CREATE: "projects.create",
  PROJECTS_UPDATE: "projects.update",
  PROJECTS_DELETE: "projects.delete",
  PROJECTS_STATUS_CHANGE: "projects.status.change",
  APARTMENTS_CREATE: "apartments.create",
  CUSTOMERS_READ: "customers.read",
  CUSTOMERS_CREATE: "customers.create",
  CUSTOMERS_UPDATE: "customers.update",
  CUSTOMERS_DELETE: "customers.delete",
  TASKS_READ: "tasks.read",
  TASKS_CREATE: "tasks.create",
  TASKS_UPDATE: "tasks.update",
  TASKS_DELETE: "tasks.delete",
  TASKS_ASSIGN: "tasks.assign",
  TASKS_URGENCY_CHANGE: "tasks.urgency.change",
  TASKS_CLAIM: "tasks.claim",
  TASKS_STATUS_UPDATE: "tasks.status.update",
  EMPLOYEES_READ: "employees.read",
  EMPLOYEES_CREATE: "employees.create",
  EMPLOYEES_UPDATE: "employees.update",
  EMPLOYEES_DELETE: "employees.delete",
  EMPLOYEES_ROLES_ASSIGN: "employees.roles.assign",
  DRIVE_READ: "drive.read",
  DRIVE_UPLOAD: "drive.upload",
  DRIVE_MOVE: "drive.move",
  DRIVE_DELETE: "drive.delete",
  DRIVE_PROVISION: "drive.provision",
  DRIVE_CONNECTION_CHECK: "drive.connection.check",
  DRIVE_TEMPLATES_READ: "drive_templates.read",
  DRIVE_TEMPLATES_CREATE: "drive_templates.create",
  DRIVE_TEMPLATES_UPDATE: "drive_templates.update",
  DRIVE_TEMPLATES_DELETE: "drive_templates.delete",
  ADDRESSES_LOOKUP: "addresses.lookup",
  BOQ_TEMPLATES_MANAGE: "boq_templates.manage",
  PROJECT_BOQ_READ: "project_boq.read",
  PROJECT_BOQ_MANAGE: "project_boq.manage",
  SUPPLIER_AGREEMENTS_MANAGE: "supplier_agreements.manage",
  PURCHASE_REQUESTS_REVIEW: "purchase_requests.review",
  PURCHASE_ORDERS_APPROVE: "purchase_orders.approve",
  PURCHASE_ORDERS_SEND: "purchase_orders.send",
  EXECUTION_HANDOFFS_MANAGE: "execution_handoffs.manage",
  SUBCONTRACTOR_SETTLEMENTS_APPROVE: "subcontractor_settlements.approve",
  PAYMENTS_RECORD: "payments.record",
} as const;

export type PermissionType = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];
export const PERMISSION_VALUES = Object.values(PERMISSIONS);
export const PERMISSION_COPY = {
  DENIED: "אין הרשאה לפעולה זו",
  LOADING: "מאמת הרשאות...",
  ERROR: "לא ניתן לאמת את הרשאות החשבון",
};
export const PERMISSION_MIGRATION = "20261025093708_add_feature_permissions.sql";

const PURCHASING_PERMISSION_VALUES = [
  PERMISSIONS.BOQ_TEMPLATES_MANAGE,
  PERMISSIONS.PROJECT_BOQ_READ,
  PERMISSIONS.PROJECT_BOQ_MANAGE,
  PERMISSIONS.SUPPLIER_AGREEMENTS_MANAGE,
  PERMISSIONS.PURCHASE_REQUESTS_REVIEW,
  PERMISSIONS.PURCHASE_ORDERS_APPROVE,
  PERMISSIONS.PURCHASE_ORDERS_SEND,
  PERMISSIONS.EXECUTION_HANDOFFS_MANAGE,
  PERMISSIONS.SUBCONTRACTOR_SETTLEMENTS_APPROVE,
  PERMISSIONS.PAYMENTS_RECORD,
];

export const INITIAL_PERMISSION_VALUES = PERMISSION_VALUES.filter(
  key =>
    !Object.values(QUOTATION_PERMISSIONS).some(quotationKey => quotationKey === key) &&
    !PURCHASING_PERMISSION_VALUES.some(purchasingKey => purchasingKey === key),
);
