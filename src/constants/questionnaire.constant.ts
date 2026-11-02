import { URLS } from "./environment.constant.ts";

export const QUESTIONNAIRE = {
  VERSION: 1,
  CLIENT_PORT: 5181,
  SLUG: "genair-workflow",
  GET_PATH: "/questionnaire/genair-workflow",
  SUBMIT_PATH: "/questionnaire-submission",
  CLIENT_ORIGIN: "http://localhost:5181",
  BACKEND_ORIGIN: URLS.BACKEND,
  KEYS: Array.from({ length: 7 }, (_, index) => `answer${index + 1}`),
} as const;
