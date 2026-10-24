import type { Page, Route } from "@playwright/test";
import { HTTP_STATUS } from "../constants/http.constant.ts";
import { API_PROXY_PREFIX } from "../constants/api.constant.ts";
import { createDeferred } from "../utilities/deferred.utility.ts";

const API_REQUEST_FAILURE = "Temporary API failure";

interface IApiRequestInterception {
  release: () => Promise<void>;
}

const matchApiPath =
  (apiPath: string) =>
  (url: URL): boolean =>
    url.pathname === `${API_PROXY_PREFIX}${apiPath}`;

export const failApiRequests = async (
  page: Page,
  apiPath: string,
): Promise<IApiRequestInterception> => {
  const matcher = matchApiPath(apiPath);

  const fail = (route: Route) =>
    route.fulfill({
      status: HTTP_STATUS.INTERNAL_SERVER_ERROR,
      json: { message: API_REQUEST_FAILURE },
    });

  await page.route(matcher, fail);

  return { release: () => page.unroute(matcher, fail) };
};

export const holdApiRequests = async (
  page: Page,
  apiPath: string,
): Promise<IApiRequestInterception> => {
  const matcher = matchApiPath(apiPath);
  const pending = createDeferred();

  const hold = async (route: Route) => {
    await pending.promise;
    await route.fallback();
  };

  await page.route(matcher, hold);

  const release = async () => {
    pending.resolve();
    await page.unroute(matcher, hold);
  };

  return { release };
};

interface IHeldFailingApiRequests {
  fail: () => Promise<void>;
  restore: () => Promise<void>;
}

// Playwright runs the most recently registered route first, so the hold is registered after the failure.
export const holdThenFailApiRequests = async (
  page: Page,
  apiPath: string,
): Promise<IHeldFailingApiRequests> => {
  const failing = await failApiRequests(page, apiPath);
  const pending = await holdApiRequests(page, apiPath);

  return { fail: pending.release, restore: failing.release };
};
