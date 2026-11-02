import {
  submissionInput,
  activateQuestionnaire,
  readQuestionnaireSubmissions,
} from "../../src/environment/questionnaire-fixture.ts";

import { test, expect } from "@playwright/test";
import { QUESTIONNAIRE } from "../../src/constants/questionnaire.constant.ts";
import { createTestDatabaseClient } from "../../src/environment/test-database-client.ts";

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
