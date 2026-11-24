import type {
  IDirectoryRequestState,
  IDirectorySearchMonitor,
  IDelayedDirectorySearch,
  IDelayedDirectorySearchOptions,
  IDelayedDirectoryResponseOptions,
} from "../interfaces/contact-search.interface.ts";

import { createDeferred } from "./deferred.utility.ts";
import type { Page, Request, Route } from "@playwright/test";
import { CONTACT_SEARCH } from "../constants/contact-search.constant.ts";
import { HTTP_METHODS, HTTP_STATUS } from "../constants/http.constant.ts";

export const isDirectorySearch = (request: Request): boolean =>
  request.method() === HTTP_METHODS.GET &&
  new URL(request.url()).pathname.endsWith(CONTACT_SEARCH.ENDPOINT);

export const directoryQuery = (request: Request): string =>
  new URL(request.url()).searchParams.get("search") ?? "";

export const monitorDirectorySearch = (page: Page): IDirectorySearchMonitor => {
  const queries: string[] = [];
  const observe = (request: Request): void => {
    if (!isDirectorySearch(request)) {
      return;
    }

    queries.push(directoryQuery(request));
  };
  page.on("request", observe);
  return { queries, dispose: () => page.off("request", observe) };
};

export const freezeSearchClock = async (page: Page): Promise<void> => {
  await page.clock.install();
  const pauseAt = await page.evaluate(
    lead => Date.now() + lead,
    CONTACT_SEARCH.CLOCK_PAUSE_LEAD_MS,
  );
  await page.clock.pauseAt(pauseAt);
};

export const nextPaint = async (page: Page): Promise<void> => {
  await page.evaluate(
    () =>
      new Promise<void>(resolve =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      ),
  );
};

const delayDirectoryResponse = async (
  options: IDelayedDirectoryResponseOptions,
): Promise<IDelayedDirectorySearch> => {
  const started = createDeferred();
  const released = createDeferred();
  const finished = createDeferred();
  const state: IDirectoryRequestState = { request: null };
  const handle = async (route: Route): Promise<void> => {
    const request = route.request();
    const matches = isDirectorySearch(request) && directoryQuery(request) === options.query;
    if (!matches) {
      await route.fallback();
      return;
    }

    state.request = request;
    try {
      const response = await route.fetch();
      started.resolve();
      await released.promise;
      await options.reply(route, response);
    } finally {
      started.resolve();
      finished.resolve();
    }
  };
  await options.page.route(CONTACT_SEARCH.ROUTE, handle);
  return {
    started: started.promise,
    finished: finished.promise,
    release: released.resolve,
    isAborted: () => state.request?.failure() !== null && state.request !== null,
    dispose: async () => {
      released.resolve();
      if (state.request) {
        await finished.promise;
      }

      await options.page.unroute(CONTACT_SEARCH.ROUTE, handle);
    },
  };
};

export const delayDirectorySearch = (
  options: IDelayedDirectorySearchOptions,
): Promise<IDelayedDirectorySearch> =>
  delayDirectoryResponse({ ...options, reply: (route, response) => route.fulfill({ response }) });

export const delayFailedDirectorySearch = (
  options: IDelayedDirectorySearchOptions,
): Promise<IDelayedDirectorySearch> =>
  delayDirectoryResponse({
    ...options,
    reply: route =>
      route.fulfill({
        status: HTTP_STATUS.SERVICE_UNAVAILABLE,
        json: { message: CONTACT_SEARCH.FAILED_SEARCH },
      }),
  });
