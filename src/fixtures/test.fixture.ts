import { URLS } from "../constants/environment.constant.ts";
import { USER_ROLES } from "../constants/user-role.constant.ts";
import { TEST_USERS } from "../constants/test-users.constant.ts";
import type { ICredentials } from "../interfaces/test-user.interface.ts";
import { test as base, type Page, type BrowserContext } from "@playwright/test";
import { buildAuthState, getAuthStatePath } from "../utilities/auth-state.utility.ts";
import { createGenAirApi, loginThroughApi, type TGenAirApi } from "../api/gen-air-api.ts";

interface IGenAirFixtures {
  api: TGenAirApi;
  openPageAs: (credentials: ICredentials) => Promise<Page>;
  apiAs: (credentials: ICredentials) => Promise<TGenAirApi>;
}

export const test = base.extend<IGenAirFixtures>({
  storageState: getAuthStatePath(USER_ROLES.SYSTEM_ADMIN),
  api: async ({ playwright }, use) => {
    const request = await playwright.request.newContext({ baseURL: URLS.BACKEND });

    try {
      const session = await loginThroughApi(request, TEST_USERS[USER_ROLES.SYSTEM_ADMIN]);

      await use(createGenAirApi(request, session));
    } finally {
      await request.dispose();
    }
  },
  apiAs: async ({ playwright }, use) => {
    const request = await playwright.request.newContext({ baseURL: URLS.BACKEND });

    const apiAs = async (credentials: ICredentials) =>
      createGenAirApi(request, await loginThroughApi(request, credentials));

    try {
      await use(apiAs);
    } finally {
      await request.dispose();
    }
  },
  openPageAs: async ({ browser, playwright }, use) => {
    const request = await playwright.request.newContext({ baseURL: URLS.BACKEND });
    const contexts: BrowserContext[] = [];

    const openPageAs = async (credentials: ICredentials) => {
      const session = await loginThroughApi(request, credentials);
      const context = await browser.newContext({ storageState: buildAuthState(session) });

      contexts.push(context);

      return context.newPage();
    };

    try {
      await use(openPageAs);
    } finally {
      await Promise.all(contexts.map(context => context.close()));
      await request.dispose();
    }
  },
});

export { expect } from "@playwright/test";
