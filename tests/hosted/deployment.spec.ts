import {
  SECURE_PROTOCOL,
  HTML_CONTENT_TYPE,
  MISSING_ASSET_PATH,
  UNKNOWN_CREDENTIALS,
  HOSTED_CLIENT_ROUTES,
} from "../../src/constants/hosted.constant.ts";

import { test, expect } from "@playwright/test";
import { ROUTES } from "../../src/constants/routes.constant.ts";
import { createLoginPage } from "../../src/pages/login.page.ts";
import { HTTP_STATUS, HTTP_HEADERS } from "../../src/constants/http.constant.ts";
import { API_PATHS, API_PROXY_PREFIX } from "../../src/constants/api.constant.ts";

const LOGIN_API = `${API_PROXY_PREFIX}${API_PATHS.LOGIN}`;
const PROTECTED_API = `${API_PROXY_PREFIX}${API_PATHS.USER}`;

test.describe("hosted deployment", () => {
  test("serves the app over HTTPS and lands a visitor on login", async ({ page }) => {
    const loginPage = createLoginPage(page);

    await page.goto(ROUTES.BOARD);

    await expect(page).toHaveURL(ROUTES.LOGIN);
    await expect(loginPage.heading).toBeVisible();

    const { protocol } = new URL(page.url());

    expect(protocol).toBe(SECURE_PROTOCOL);
  });

  for (const route of HOSTED_CLIENT_ROUTES) {
    test(`client route ${route} falls back to the app`, async ({ page, request }) => {
      const loginPage = createLoginPage(page);
      const response = await request.get(route);

      expect(response.status()).toBe(HTTP_STATUS.OK);
      expect(response.headers()[HTTP_HEADERS.CONTENT_TYPE]).toContain(HTML_CONTENT_TYPE);

      await page.goto(route);

      await expect(page).toHaveURL(ROUTES.LOGIN);
      await expect(loginPage.heading).toBeVisible();
    });
  }

  test("a missing hashed asset is not answered with the app shell", async ({ request }) => {
    const response = await request.get(MISSING_ASSET_PATH);

    expect(response.status()).toBe(HTTP_STATUS.NOT_FOUND);
  });

  test("the same-origin API rejects unknown credentials", async ({ request }) => {
    const response = await request.post(LOGIN_API, {
      data: { ...UNKNOWN_CREDENTIALS, rememberMe: false },
    });

    expect(response.status()).toBe(HTTP_STATUS.UNAUTHORIZED);
  });

  test("login with unknown credentials shows an error through the proxy", async ({ page }) => {
    const loginPage = createLoginPage(page);
    const loginResponse = page.waitForResponse(response => response.url().endsWith(LOGIN_API));

    await loginPage.goto();
    await loginPage.login(UNKNOWN_CREDENTIALS);

    const response = await loginResponse;

    expect(response.status()).toBe(HTTP_STATUS.UNAUTHORIZED);
    await expect(page.getByRole("alert")).toBeVisible();
    await expect(page).toHaveURL(ROUTES.LOGIN);
  });

  test("protected API routes reject requests without a session", async ({ request }) => {
    const response = await request.get(PROTECTED_API);

    expect(response.status()).toBe(HTTP_STATUS.UNAUTHORIZED);
  });
});
