import {
  TASK_SORT_COPY,
  TASK_SORT_MODES,
  TASK_SORT_FIXTURE,
} from "../constants/task-sort.constant.ts";

import type {
  ITaskSortDelay,
  ITaskSortFailure,
  ITaskSortMonitor,
  ITaskSortRequest,
  ITaskSortRequestState,
} from "../interfaces/task-sort.interface.ts";

import { randomUUID } from "node:crypto";
import { createDeferred } from "./deferred.utility.ts";
import { buildBrowserApiPath } from "./api-path.utility.ts";
import type { Page, Request, Route } from "@playwright/test";
import { HTTP_METHODS, HTTP_STATUS } from "../constants/http.constant.ts";
import { observeResponseConsumption } from "./response-consumption.utility.ts";

export const isTaskSortRequest = (request: Request): boolean =>
  request.method() === HTTP_METHODS.GET &&
  new URL(request.url()).pathname.endsWith(TASK_SORT_FIXTURE.ENDPOINT);

export const taskRequestSort = (request: Request): string =>
  new URL(request.url()).searchParams.get("sort") ?? TASK_SORT_MODES.DEFAULT;

const taskPageUrl = (request: Request): string => {
  const url = new URL(request.url());
  url.searchParams.set("batchSize", String(TASK_SORT_FIXTURE.PAGE_SIZE));
  return url.toString();
};

export const useSmallTaskPages = async (page: Page): Promise<void> => {
  await page.route(TASK_SORT_FIXTURE.ROUTE, async route => {
    if (!isTaskSortRequest(route.request())) {
      await route.fallback();
      return;
    }

    await route.continue({ url: taskPageUrl(route.request()) });
  });
};

export const monitorTaskSort = (page: Page): ITaskSortMonitor => {
  const requests: ITaskSortRequest[] = [];
  const observe = (request: Request): void => {
    if (!isTaskSortRequest(request)) {
      return;
    }

    const query = new URL(request.url()).searchParams;
    requests.push({
      sort: query.get("sort") ?? TASK_SORT_MODES.DEFAULT,
      cursor: query.get("batchCursor"),
    });
  };
  page.on("request", observe);
  return { requests, dispose: () => page.off("request", observe) };
};

export const delayTaskSort = async (page: Page, sort: string): Promise<ITaskSortDelay> => {
  const started = createDeferred();
  const released = createDeferred();
  const finished = createDeferred();
  const consumed = createDeferred();
  const acknowledge = TASK_SORT_FIXTURE.ACKNOWLEDGE_PREFIX + randomUUID().replaceAll("-", "");
  await page.exposeFunction(acknowledge, consumed.resolve);
  await observeResponseConsumption(
    page,
    buildBrowserApiPath(TASK_SORT_FIXTURE.ENDPOINT),
    acknowledge,
  );
  const state: ITaskSortRequestState = { request: null, failed: false, failure: null };
  const handle = async (route: Route): Promise<void> => {
    const request = route.request();
    if (!isTaskSortRequest(request) || taskRequestSort(request) !== sort) {
      await route.fallback();
      return;
    }

    state.request = request;
    try {
      const response = await route.fetch({ url: taskPageUrl(request) });
      started.resolve();
      await released.promise;
      await route.fulfill({ response });
    } catch (error) {
      state.failed = true;
      state.failure = error;
      throw error;
    } finally {
      started.resolve();
      finished.resolve();
    }
  };
  await page.route(TASK_SORT_FIXTURE.ROUTE, handle);
  return {
    started: started.promise,
    releaseAndWaitForApplication: async () => {
      if (state.failed) {
        throw state.failure;
      }

      const responseOutcome = page
        .waitForResponse(
          response =>
            isTaskSortRequest(response.request()) && taskRequestSort(response.request()) === sort,
        )
        .then(
          response => ({ response }),
          (error: unknown) => ({ error }),
        );
      released.resolve();
      await finished.promise;
      if (state.failed) {
        throw state.failure;
      }

      const outcome = await responseOutcome;
      if ("error" in outcome) {
        throw outcome.error;
      }

      if (!outcome.response.ok()) {
        throw new Error("Delayed task response failed: " + outcome.response.status());
      }

      await outcome.response.finished();
      await consumed.promise;
    },
    dispose: async () => {
      released.resolve();
      if (page.isClosed()) {
        return;
      }

      if (state.request) {
        await finished.promise;
      }

      await page.unroute(TASK_SORT_FIXTURE.ROUTE, handle);
    },
  };
};

export const failTaskSort = async (page: Page, sort: string): Promise<ITaskSortFailure> => {
  const state = { fail: true };
  const handle = async (route: Route): Promise<void> => {
    const matches = isTaskSortRequest(route.request()) && taskRequestSort(route.request()) === sort;
    if (!matches || !state.fail) {
      await route.fallback();
      return;
    }

    await route.fulfill({
      status: HTTP_STATUS.SERVICE_UNAVAILABLE,
      json: { message: TASK_SORT_COPY.REQUEST_ERROR },
    });
  };
  await page.route(TASK_SORT_FIXTURE.ROUTE, handle);
  return {
    recover: (): void => {
      state.fail = false;
    },
    dispose: async () => {
      if (page.isClosed()) {
        return;
      }

      await page.unroute(TASK_SORT_FIXTURE.ROUTE, handle);
    },
  };
};
