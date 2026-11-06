import {
  submissionInput,
  activateQuestionnaire,
  readQuestionnaireSubmissions,
} from "../../src/environment/questionnaire-fixture.ts";

import { test, expect } from "@playwright/test";
import { QUESTIONNAIRE } from "../../src/constants/questionnaire.constant.ts";
import { AUTH_SECURITY } from "../../src/constants/auth-security.constant.ts";
import { createTestDatabaseClient } from "../../src/environment/test-database-client.ts";
import { parseSignedClientCookie } from "../../src/utilities/anonymous-client.utility.ts";

const state = { questionnaireId: "" };

test.beforeAll(async () => {
  state.questionnaireId = (await activateQuestionnaire()).id;
});

test("public questionnaire and immutable original answers persist without login; replay deduplicates", async ({
  request,
}) => {
  const definition = await request.get(`${QUESTIONNAIRE.BACKEND_ORIGIN}${QUESTIONNAIRE.GET_PATH}`);
  expect(definition.status()).toBe(200);
  expect(await definition.json()).toMatchObject({
    id: state.questionnaireId,
    slug: QUESTIONNAIRE.SLUG,
    version: QUESTIONNAIRE.VERSION,
  });
  const input = submissionInput(state.questionnaireId);
  const first = await request.post(`${QUESTIONNAIRE.BACKEND_ORIGIN}${QUESTIONNAIRE.SUBMIT_PATH}`, {
    data: input,
  });
  expect(first.status()).toBe(201);
  const retry = await request.post(`${QUESTIONNAIRE.BACKEND_ORIGIN}${QUESTIONNAIRE.SUBMIT_PATH}`, {
    data: input,
  });
  expect(retry.status()).toBe(201);
  expect(await retry.json()).toEqual(await first.json());
  const rows = await readQuestionnaireSubmissions(input.fullName);
  expect(rows).toHaveLength(1);
  expect(rows[0]?.questionnaire_id).toBe(state.questionnaireId);
  expect(rows[0]?.answers).toEqual(input.answers);
});

test("public submission surface rejects changed replay, version mismatch and all-blank answers", async ({
  request,
}) => {
  const input = submissionInput(state.questionnaireId);
  const endpoint = `${QUESTIONNAIRE.BACKEND_ORIGIN}${QUESTIONNAIRE.SUBMIT_PATH}`;
  expect((await request.post(endpoint, { data: input })).status()).toBe(201);
  expect((await request.post(endpoint, { data: { ...input, role: "different" } })).status()).toBe(
    409,
  );
  const mismatch = submissionInput(state.questionnaireId);
  mismatch.answers[0].questionKey = "not-in-version";
  expect((await request.post(endpoint, { data: mismatch })).status()).toBe(400);
  const blank = submissionInput(state.questionnaireId);
  blank.answers.forEach(answer => {
    answer.value = "   ";
  });
  expect((await request.post(endpoint, { data: blank })).status()).toBe(400);
  expect(await readQuestionnaireSubmissions(blank.fullName)).toHaveLength(0);
});

test("no public response read/list exists and CRM authentication remains required", async ({
  request,
}) => {
  expect(
    (await request.get(`${QUESTIONNAIRE.BACKEND_ORIGIN}${QUESTIONNAIRE.SUBMIT_PATH}`)).status(),
  ).toBe(404);
  expect((await request.get(`${QUESTIONNAIRE.BACKEND_ORIGIN}/customer`)).status()).toBe(401);
});

test("questionnaire proxy forwards API requests, limits a signed caller, and grants no CRM access", async ({
  request,
}) => {
  const first = await request.get(`${QUESTIONNAIRE.CLIENT_ORIGIN}/health`);
  expect(first.status()).toBe(200);
  const setCookie = first.headers()["set-cookie"] ?? "";
  for (const attribute of AUTH_SECURITY.COOKIE_ATTRIBUTES) {
    expect(setCookie).toContain(attribute);
  }
  const cookie = parseSignedClientCookie(setCookie);
  const cookieName = cookie.split("=")[0];

  const proxyDefinition = await request.get(
    `${QUESTIONNAIRE.CLIENT_ORIGIN}${QUESTIONNAIRE.GET_PATH}`,
    {
      headers: { Cookie: cookie },
    },
  );
  expect(proxyDefinition.status()).toBe(200);
  expect(await proxyDefinition.json()).toMatchObject({ id: state.questionnaireId });
  expect(proxyDefinition.headers()["set-cookie"]).toBeUndefined();

  const input = submissionInput(state.questionnaireId);
  const proxiedSubmission = await request.post(
    `${QUESTIONNAIRE.CLIENT_ORIGIN}${QUESTIONNAIRE.SUBMIT_PATH}`,
    { headers: { Cookie: cookie }, data: input },
  );
  expect(proxiedSubmission.status()).toBe(201);
  expect(await readQuestionnaireSubmissions(input.fullName)).toHaveLength(1);

  const accepted = await request.get(`${QUESTIONNAIRE.BACKEND_ORIGIN}${QUESTIONNAIRE.GET_PATH}`, {
    headers: { Cookie: cookie },
  });
  expect(accepted.status()).toBe(200);
  expect(accepted.headers()["set-cookie"]).toBeUndefined();

  const rejected = await request.get(`${QUESTIONNAIRE.BACKEND_ORIGIN}${QUESTIONNAIRE.GET_PATH}`, {
    headers: { Cookie: `${cookieName}=forged` },
  });
  expect(rejected.status()).toBe(200);
  expect(parseSignedClientCookie(rejected.headers()["set-cookie"] ?? "")).not.toBe(cookie);

  expect(
    (
      await request.get(`${QUESTIONNAIRE.BACKEND_ORIGIN}/customer`, {
        headers: { Cookie: cookie },
      })
    ).status(),
  ).toBe(401);
  expect((await request.get(`${QUESTIONNAIRE.CLIENT_ORIGIN}/customer`)).status()).toBe(404);

  const remainingProxyAttempts = Array.from(
    { length: QUESTIONNAIRE.PROXY_REQUESTS_PER_WINDOW - 2 },
    (_, index) => index + 2,
  );
  for (const attempt of remainingProxyAttempts) {
    const response = await request.get(`${QUESTIONNAIRE.CLIENT_ORIGIN}${QUESTIONNAIRE.GET_PATH}`, {
      headers: { Cookie: cookie },
    });
    expect(response.status(), `proxy request ${attempt + 1}`).toBe(200);
  }
  const limited = await request.get(`${QUESTIONNAIRE.CLIENT_ORIGIN}${QUESTIONNAIRE.GET_PATH}`, {
    headers: { Cookie: cookie },
  });
  expect(limited.status()).toBe(429);
  const other = await request.get(`${QUESTIONNAIRE.CLIENT_ORIGIN}${QUESTIONNAIRE.GET_PATH}`, {
    headers: { Cookie: `${cookieName}=invalid` },
  });
  expect(other.status()).toBe(200);
  expect(parseSignedClientCookie(other.headers()["set-cookie"] ?? "")).not.toBe(cookie);
});

test("backend questionnaire reads are limited per signed caller", async ({ request }) => {
  const endpoint = `${QUESTIONNAIRE.BACKEND_ORIGIN}${QUESTIONNAIRE.GET_PATH}`;
  const first = await request.get(endpoint);
  expect(first.status()).toBe(200);
  const cookie = parseSignedClientCookie(first.headers()["set-cookie"] ?? "");

  const remainingBackendAttempts = Array.from(
    { length: QUESTIONNAIRE.BACKEND_READS_PER_WINDOW - 1 },
    (_, index) => index + 1,
  );
  for (const attempt of remainingBackendAttempts) {
    const response = await request.get(endpoint, { headers: { Cookie: cookie } });
    expect(response.status(), `backend request ${attempt + 1}`).toBe(200);
  }
  expect((await request.get(endpoint, { headers: { Cookie: cookie } })).status()).toBe(429);
  const other = await request.get(endpoint, {
    headers: { Cookie: `${cookie.split("=")[0]}=invalid` },
  });
  expect(other.status()).toBe(200);
  expect(parseSignedClientCookie(other.headers()["set-cookie"] ?? "")).not.toBe(cookie);
});

test("concurrent duplicate requests create one durable row", async ({ request }) => {
  const input = submissionInput(state.questionnaireId);
  const responses = await Promise.all(
    Array.from({ length: 2 }, () =>
      request.post(`${QUESTIONNAIRE.BACKEND_ORIGIN}${QUESTIONNAIRE.SUBMIT_PATH}`, { data: input }),
    ),
  );
  expect(responses.map(response => response.status())).toEqual([201, 201]);
  expect(await responses[0].json()).toEqual(await responses[1].json());
  expect(await readQuestionnaireSubmissions(input.fullName)).toHaveLength(1);
});

test("closed questionnaires reject new responses but preserve exact retry receipts and immutable records", async ({
  request,
}) => {
  const input = submissionInput(state.questionnaireId);
  const endpoint = `${QUESTIONNAIRE.BACKEND_ORIGIN}${QUESTIONNAIRE.SUBMIT_PATH}`;
  const first = await request.post(endpoint, { data: input });
  expect(first.status()).toBe(201);
  const database = createTestDatabaseClient();
  await database.connect();
  try {
    await expect(
      database.query("UPDATE questionnaires SET title = 'changed' WHERE id = $1", [
        state.questionnaireId,
      ]),
    ).rejects.toThrow("immutable");
    await expect(
      database.query(
        "UPDATE questionnaire_submissions SET role = 'changed' WHERE request_id = $1",
        [input.requestId],
      ),
    ).rejects.toThrow("append-only");
    await database.query("UPDATE questionnaires SET accepting_responses = FALSE WHERE id = $1", [
      state.questionnaireId,
    ]);
    expect(
      (await request.get(`${QUESTIONNAIRE.BACKEND_ORIGIN}${QUESTIONNAIRE.GET_PATH}`)).status(),
    ).toBe(404);
    const retry = await request.post(endpoint, { data: input });
    expect(retry.status()).toBe(201);
    expect(await retry.json()).toEqual(await first.json());
    expect(
      (await request.post(endpoint, { data: submissionInput(state.questionnaireId) })).status(),
    ).toBe(404);
  } finally {
    await database.query("UPDATE questionnaires SET accepting_responses = TRUE WHERE id = $1", [
      state.questionnaireId,
    ]);
    await database.end();
  }
});
