import { buildTestEmail } from "../utilities/test-data.utility.ts";
import type { ITestUser } from "../interfaces/test-user.interface.ts";
import { USER_ROLES, type UserRoleType } from "./user-role.constant.ts";

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
};
