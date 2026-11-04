import type { APIRequestContext } from "@playwright/test";
import { loginThroughApi } from "../../src/api/gen-air-api.ts";
import { API_PATHS } from "../../src/constants/api.constant.ts";
import { test, expect } from "../../src/fixtures/test.fixture.ts";
import { URLS } from "../../src/constants/environment.constant.ts";
import { seedUser, buildUserInput } from "../../src/api/seed-data.ts";
import { USER_ROLES } from "../../src/constants/user-role.constant.ts";
import { hashPassword } from "../../src/utilities/password.utility.ts";
import { isSession } from "../../src/utilities/entity-guard.utility.ts";
import { AUTH_SECURITY } from "../../src/constants/auth-security.constant.ts";
import { HTTP_METHODS, HTTP_STATUS } from "../../src/constants/http.constant.ts";
import { createTestDatabaseClient } from "../../src/environment/test-database-client.ts";
import { parseSignedClientCookie } from "../../src/utilities/anonymous-client.utility.ts";
import { createUniqueEmail, createUniquePassword } from "../../src/utilities/test-data.utility.ts";

const WRONG_PASSWORD = "NotThePassword123!";

const clearDisposableLoginAttempts = async () => {
  const database = createTestDatabaseClient();
  await database.connect();
  try {
    await database.query("DELETE FROM public.auth_login_attempts");
  } finally {
    await database.end();
  }
};

test.beforeAll(clearDisposableLoginAttempts);
test.afterEach(clearDisposableLoginAttempts);

const login = (request: APIRequestContext, email: string, cookie?: string) =>
  request.post(API_PATHS.LOGIN, {
    data: { email, password: WRONG_PASSWORD, rememberMe: false },
    ...(cookie && { headers: { Cookie: cookie } }),
  });

const readClientCookie = (setCookie: string): string => {
  for (const attribute of AUTH_SECURITY.COOKIE_ATTRIBUTES) {
    expect(setCookie).toContain(attribute);
  }

  return parseSignedClientCookie(setCookie);
};

test("a signed caller reaches its login failure limit and receives 429", async ({ playwright }) => {
  const request = await playwright.request.newContext({ baseURL: URLS.BACKEND });
  try {
    const first = await login(request, createUniqueEmail("login-caller-limit"));
    expect(first.status()).toBe(HTTP_STATUS.UNAUTHORIZED);
    const cookie = readClientCookie(first.headers()["set-cookie"] ?? "");

    for (const attempt of Array.from({ length: AUTH_SECURITY.CALLER_FAILURE_LIMIT - 1 }).keys()) {
      const response = await login(request, createUniqueEmail("login-caller-limit"), cookie);
      expect(response.status(), "caller attempt " + attempt).toBe(HTTP_STATUS.UNAUTHORIZED);
    }

    expect((await login(request, createUniqueEmail("login-caller-limit"), cookie)).status()).toBe(
      HTTP_STATUS.TOO_MANY_REQUESTS,
    );
  } finally {
    await request.dispose();
  }
});

test("separate signed callers cannot bypass the account login limit", async ({ playwright }) => {
  const request = await playwright.request.newContext({ baseURL: URLS.BACKEND });
  const email = createUniqueEmail("login-account-limit");

  try {
    const first = await login(request, email);
    expect(first.status()).toBe(HTTP_STATUS.UNAUTHORIZED);
    const cookieName = readClientCookie(first.headers()["set-cookie"] ?? "").split("=")[0];
    const invalidCookie = cookieName + "=invalid";

    for (const attempt of Array.from({ length: AUTH_SECURITY.ACCOUNT_FAILURE_LIMIT - 1 }).keys()) {
      const response = await login(request, email, invalidCookie);
      expect(response.status(), "account attempt " + attempt).toBe(HTTP_STATUS.UNAUTHORIZED);
    }

    expect((await login(request, email, invalidCookie)).status()).toBe(
      HTTP_STATUS.TOO_MANY_REQUESTS,
    );
  } finally {
    await request.dispose();
  }
});

test("distinct callers and accounts reach the global login circuit breaker", async ({
  playwright,
}) => {
  const request = await playwright.request.newContext({ baseURL: URLS.BACKEND });

  try {
    const first = await login(request, createUniqueEmail("login-global-limit"));
    expect(first.status()).toBe(HTTP_STATUS.UNAUTHORIZED);
    const cookieName = readClientCookie(first.headers()["set-cookie"] ?? "").split("=")[0];
    const invalidCookie = cookieName + "=invalid";

    for (const attempt of Array.from({ length: AUTH_SECURITY.GLOBAL_FAILURE_LIMIT - 1 }).keys()) {
      const response = await login(request, createUniqueEmail("login-global-limit"), invalidCookie);
      expect(response.status(), "global attempt " + attempt).toBe(HTTP_STATUS.UNAUTHORIZED);
    }

    expect(
      (await login(request, createUniqueEmail("login-global-limit"), invalidCookie)).status(),
    ).toBe(HTTP_STATUS.TOO_MANY_REQUESTS);
  } finally {
    await request.dispose();
  }
});

test("password change revokes all existing sessions and requires the new password", async ({
  api,
  playwright,
}) => {
  const user = await seedUser(api, USER_ROLES.SECRETARY);
  const request = await playwright.request.newContext({ baseURL: URLS.BACKEND });
  const newPassword = createUniquePassword();

  try {
    const first = await loginThroughApi(request, user);
    const secondLogin = await request.post(API_PATHS.LOGIN, {
      data: { email: user.email, password: user.password, rememberMe: false },
    });
    expect(secondLogin.status()).toBe(HTTP_STATUS.OK);
    const secondBody: unknown = await secondLogin.json();
    if (!isSession(secondBody)) {
      throw new Error("Expected a second independent login session");
    }
    const second = secondBody;
    expect(second.accessToken).not.toBe(first.accessToken);
    const changed = await request.patch(API_PATHS.MY_PASSWORD, {
      headers: { Authorization: "Bearer " + first.accessToken },
      data: { currentPassword: user.password, password: newPassword },
    });
    expect(changed.status()).toBe(HTTP_STATUS.NO_CONTENT);

    for (const session of [first, second]) {
      const currentUser = await request.get(API_PATHS.MY_USER, {
        headers: { Authorization: "Bearer " + session.accessToken },
      });
      expect(currentUser.status()).toBe(HTTP_STATUS.UNAUTHORIZED);
    }

    const oldLogin = await request.post(API_PATHS.LOGIN, {
      data: { email: user.email, password: user.password },
    });
    expect(oldLogin.status()).toBe(HTTP_STATUS.UNAUTHORIZED);

    const current = await loginThroughApi(request, { email: user.email, password: newPassword });
    const currentUser = await request.get(API_PATHS.MY_USER, {
      headers: { Authorization: "Bearer " + current.accessToken },
    });
    expect(currentUser.status()).toBe(HTTP_STATUS.OK);
  } finally {
    await request.dispose();
  }
});

test("wrong current password and password reuse leave the existing session valid", async ({
  api,
  playwright,
}) => {
  const user = await seedUser(api, USER_ROLES.SECRETARY);
  const request = await playwright.request.newContext({ baseURL: URLS.BACKEND });

  try {
    const session = await loginThroughApi(request, user);
    const headers = { Authorization: "Bearer " + session.accessToken };
    const wrongCurrent = await request.patch(API_PATHS.MY_PASSWORD, {
      headers,
      data: { currentPassword: WRONG_PASSWORD, password: createUniquePassword() },
    });
    expect(wrongCurrent.status()).toBe(HTTP_STATUS.BAD_REQUEST);
    expect(await wrongCurrent.json()).toMatchObject({
      code: AUTH_SECURITY.INVALID_CURRENT_PASSWORD,
    });

    const reused = await request.patch(API_PATHS.MY_PASSWORD, {
      headers,
      data: { currentPassword: user.password, password: user.password },
    });
    expect(reused.status()).toBe(HTTP_STATUS.BAD_REQUEST);
    expect((await request.get(API_PATHS.MY_USER, { headers })).status()).toBe(HTTP_STATUS.OK);
  } finally {
    await request.dispose();
  }
});

test("blocked preset password cannot create an account or authenticate a legacy account", async ({
  api,
  playwright,
}) => {
  const input = {
    ...buildUserInput(USER_ROLES.SECRETARY),
    password: AUTH_SECURITY.BLOCKED_LEGACY_PASSWORD,
  };
  const rejected = await api.send(HTTP_METHODS.POST, API_PATHS.USER, input);
  expect(rejected.status()).toBe(HTTP_STATUS.BAD_REQUEST);

  const legacy = await seedUser(api, USER_ROLES.SECRETARY);
  const database = createTestDatabaseClient();
  await database.connect();
  try {
    const hash = await hashPassword(AUTH_SECURITY.BLOCKED_LEGACY_PASSWORD);
    await database.query("UPDATE users SET password_hash = $1 WHERE id = $2", [hash, legacy.id]);
  } finally {
    await database.end();
  }

  const request = await playwright.request.newContext({ baseURL: URLS.BACKEND });
  try {
    const response = await request.post(API_PATHS.LOGIN, {
      data: { email: legacy.email, password: AUTH_SECURITY.BLOCKED_LEGACY_PASSWORD },
    });
    expect(response.status()).toBe(HTTP_STATUS.UNAUTHORIZED);
  } finally {
    await request.dispose();
  }
});
