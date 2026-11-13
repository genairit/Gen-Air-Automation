import { dirname } from "node:path";
import { test as setup } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import { loginThroughApi } from "../src/api/gen-air-api.ts";
import { URLS } from "../src/constants/environment.constant.ts";
import { SETUP_TEST_USERS } from "../src/constants/test-users.constant.ts";
import { buildAuthState, getAuthStatePath } from "../src/utilities/auth-state.utility.ts";

for (const user of SETUP_TEST_USERS) {
  setup(`authenticate ${user.role}`, async ({ playwright }) => {
    const request = await playwright.request.newContext({ baseURL: URLS.BACKEND });
    const authStatePath = getAuthStatePath(user.role);

    try {
      const session = await loginThroughApi(request, user);

      await mkdir(dirname(authStatePath), { recursive: true });
      await writeFile(authStatePath, JSON.stringify(buildAuthState(session)));
    } finally {
      await request.dispose();
    }
  });
}
