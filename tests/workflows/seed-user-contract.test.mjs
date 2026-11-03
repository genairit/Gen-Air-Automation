import { test } from "node:test";
import assert from "node:assert/strict";
import { buildUserInput } from "../../src/api/seed-data.ts";
import { USER_ROLES } from "../../src/constants/user-role.constant.ts";

for (const role of Object.values(USER_ROLES)) {
  test(`user fixture assigns only the ${role} role under the create API contract`, () => {
    const user = buildUserInput(role);
    assert.equal("role" in user, false);
    assert.deepEqual(user.assignedRoles, [role]);
    assert.ok(user.email);
    assert.ok(user.password);
  });
}
