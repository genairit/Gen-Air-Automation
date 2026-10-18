import type { Page, Route } from "@playwright/test";
import { HTTP_METHODS, HTTP_STATUS } from "../constants/http.constant.ts";
import { API_PATHS, API_PROXY_PREFIX } from "../constants/api.constant.ts";

export const CUSTOMER_CREATION_FAILURE = "Temporary customer creation failure";

export const failNextCustomerCreation = async (page: Page): Promise<void> => {
  const pattern = `**${API_PROXY_PREFIX}${API_PATHS.CUSTOMER}`;

  const failCreation = async (route: Route) => {
    if (route.request().method() !== HTTP_METHODS.POST) {
      await route.fallback();
      return;
    }

    await page.unroute(pattern, failCreation);
    await route.fulfill({
      status: HTTP_STATUS.INTERNAL_SERVER_ERROR,
      json: { message: CUSTOMER_CREATION_FAILURE },
    });
  };

  await page.route(pattern, failCreation);
};
