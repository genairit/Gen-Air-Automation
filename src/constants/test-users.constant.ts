import { buildTestEmail } from "../utilities/test-data.utility.ts";
import type { ITestUser } from "../interfaces/test-user.interface.ts";
import { USER_ROLES, USER_ROLE_VALUES, type UserRoleType } from "./user-role.constant.ts";

export const TEST_PASSWORD = "Automation123!";

export const TEST_USERS: Record<UserRoleType, ITestUser> = {
  [USER_ROLES.SYSTEM_ADMIN]: {
    lastName: "מנהל",
    firstName: "אדמין",
    phone: "0521000001",
    password: TEST_PASSWORD,
    role: USER_ROLES.SYSTEM_ADMIN,
    email: buildTestEmail("admin"),
  },
  [USER_ROLES.PROJECT_MANAGER]: {
    lastName: "פרויקטים",
    firstName: "מנהלת",
    phone: "0521000002",
    password: TEST_PASSWORD,
    role: USER_ROLES.PROJECT_MANAGER,
    email: buildTestEmail("manager"),
  },
  [USER_ROLES.SECRETARY]: {
    lastName: "משרד",
    firstName: "מזכירה",
    phone: "0521000003",
    password: TEST_PASSWORD,
    role: USER_ROLES.SECRETARY,
    email: buildTestEmail("secretary"),
  },
  [USER_ROLES.INSTALLER]: {
    lastName: "שטח",
    firstName: "מתקין",
    phone: "0521000004",
    password: TEST_PASSWORD,
    role: USER_ROLES.INSTALLER,
    email: buildTestEmail("installer"),
  },
  [USER_ROLES.ENGINEER]: {
    lastName: "הנדסה",
    firstName: "מהנדסת",
    phone: "0521000005",
    password: TEST_PASSWORD,
    role: USER_ROLES.ENGINEER,
    email: buildTestEmail("engineer"),
  },
  [USER_ROLES.FINANCE]: {
    lastName: "כספים",
    firstName: "חשב",
    phone: "0521000006",
    password: TEST_PASSWORD,
    role: USER_ROLES.FINANCE,
    email: buildTestEmail("finance"),
  },
  [USER_ROLES.PURCHASING_EXECUTION_MANAGER]: {
    lastName: "רכש",
    firstName: "מנהל",
    phone: "0521000007",
    password: TEST_PASSWORD,
    role: USER_ROLES.PURCHASING_EXECUTION_MANAGER,
    email: buildTestEmail("purchasing-execution-manager"),
  },
  [USER_ROLES.SALES_AGENT]: {
    lastName: "מכירות",
    firstName: "סוכן",
    phone: "0521000008",
    password: TEST_PASSWORD,
    role: USER_ROLES.SALES_AGENT,
    email: buildTestEmail("sales-agent"),
  },
};

const setupRoles = process.env.GEN_AIR_QA_SETUP_ROLES?.split(",").map(role => role.trim()) ?? null;
const knownRoles = new Set<string>(USER_ROLE_VALUES);
const unsupportedRoles = setupRoles?.filter(role => !knownRoles.has(role)) ?? [];

if (unsupportedRoles.length > 0) {
  throw new Error(`Unknown GEN_AIR_QA_SETUP_ROLES: ${unsupportedRoles.join(", ")}`);
}

export const SETUP_TEST_USERS = Object.values(TEST_USERS).filter(
  user => setupRoles === null || setupRoles.includes(user.role),
);
