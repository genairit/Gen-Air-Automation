import {
  expectForbidden,
  expectResponseOk,
} from "../../src/utilities/response-assertion.utility.ts";

import { test } from "../../src/fixtures/test.fixture.ts";
import { TEST_USERS } from "../../src/constants/test-users.constant.ts";
import { PERMISSION_ACTIONS } from "../../src/api/permission-actions.ts";
import { ROLE_ACCESS } from "../../src/constants/role-access.constant.ts";
import { USER_ROLE_VALUES } from "../../src/constants/user-role.constant.ts";

for (const role of USER_ROLE_VALUES) {
  test.describe(`${role} through the API`, () => {
    for (const action of PERMISSION_ACTIONS) {
      const isAllowed = ROLE_ACCESS[role][action.permission];
      const expectOutcome = isAllowed ? expectResponseOk : expectForbidden;
      const verb = isAllowed ? "may" : "is forbidden to";

      test(`${verb} ${action.name}`, async ({ api, apiAs }) => {
        const actor = await apiAs(TEST_USERS[role]);
        const response = await action.perform({ admin: api, actor });

        await expectOutcome(response);
      });
    }
  });
}
