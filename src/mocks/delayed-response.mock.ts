import { randomUUID } from "node:crypto";
import type { APIResponse } from "@playwright/test";
import { createDeferred } from "../utilities/deferred.utility.ts";
import { observeResponseConsumption } from "../utilities/response-consumption.utility.ts";
import type { IDelayedResponseOptions } from "../interfaces/delayed-response.interface.ts";
import { buildBrowserApiPath, buildBrowserApiPattern } from "../utilities/api-path.utility.ts";

export const delayApiResponse = async ({ page, path, status }: IDelayedResponseOptions) => {
  const receipt = { resolve: (_response: APIResponse): void => {} };
  const received = new Promise<APIResponse>(resolve => {
    receipt.resolve = resolve;
  });
  const release = createDeferred();
  const delivered = createDeferred();
  const consumed = createDeferred();
  const acknowledge = `qaResponse${randomUUID().replaceAll("-", "")}`;
  await page.exposeFunction(acknowledge, () => consumed.resolve());
  await observeResponseConsumption(page, buildBrowserApiPath(path), acknowledge);
  await page.route(
    buildBrowserApiPattern(`${path}**`),
    async route => {
      const response = await route.fetch();
      receipt.resolve(response);
      await release.promise;
      const options = status == null ? { response } : { response, status };
      await route.fulfill(options);
      delivered.resolve();
    },
    { times: 1 },
  );

  const releaseAndWaitForApplication = async () => {
    release.resolve();
    await delivered.promise;
    await consumed.promise;
  };

  return {
    received,
    release: release.resolve,
    releaseAndWaitForApplication,
  };
};
