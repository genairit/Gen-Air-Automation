import type { APIResponse } from "@playwright/test";
import { test, expect } from "../../src/fixtures/test.fixture.ts";
import { HTTP_STATUS } from "../../src/constants/http.constant.ts";
import { TEST_USERS } from "../../src/constants/test-users.constant.ts";
import { PERMISSION_ACTIONS } from "../../src/api/permission-actions.ts";
import { ROLE_ACCESS } from "../../src/constants/role-access.constant.ts";
import { USER_ROLE_VALUES } from "../../src/constants/user-role.constant.ts";

const expectAllowed = async (response: APIResponse) =>
  expect(response.ok(), await response.text()).toBe(true);

const expectForbidden = async (response: APIResponse) =>
  expect(response.status(), await response.text()).toBe(HTTP_STATUS.FORBIDDEN);

for (const role of USER_ROLE_VALUES) {
  test.describe(`${role} through the API`, () => {
    for (const action of PERMISSION_ACTIONS) {
      const isAllowed = ROLE_ACCESS[role][action.permission];
      const expectOutcome = isAllowed ? expectAllowed : expectForbidden;
      const verb = isAllowed ? "may" : "is forbidden to";

      test(`${verb} ${action.name}`, async ({ api, apiAs }) => {
        const actor = await apiAs(TEST_USERS[role]);
        const response = await action.perform({ admin: api, actor });

        await expectOutcome(response);
      });
    }
  });
}
