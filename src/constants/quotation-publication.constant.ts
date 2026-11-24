import { TIME_UNITS } from "./time.constant.ts";

export const PUBLICATION_QA = {
  TEST_MS: 2 * TIME_UNITS.MINUTE_MS,
  RENDER_MS: 45 * TIME_UNITS.SECOND_MS,
  ARCHIVE_MS: 30 * TIME_UNITS.SECOND_MS,
  POLL_MS: 3 * TIME_UNITS.SECOND_MS,
  ERROR_POLL_MS: 10 * TIME_UNITS.SECOND_MS,
} as const;

export const PUBLICATION_STATE = {
  QUEUED: "queued",
  FAILED: "failed",
  ARCHIVED: "archived",
  UNTRACKED: "untracked",
  RENDERING: "rendering",
  PUBLISHING: "publishing",
  ARCHIVING: "archiving",
  RECONCILING: "reconciling",
  PUBLISHED: "published",
  NOT_APPLICABLE: "not_applicable",
} as const;
export type PublicationStateType = (typeof PUBLICATION_STATE)[keyof typeof PUBLICATION_STATE];
export const PUBLICATION_KIND = { ORDER: "order", QUOTATION: "quotation" } as const;
export type PublicationKindType = (typeof PUBLICATION_KIND)[keyof typeof PUBLICATION_KIND];
export const PUBLICATION_EFFECT = {
  MOVE: "move",
  CREATE: "create",
  RETAIN: "retain",
  REPLACE: "replace",
} as const;
export type PublicationEffectType = (typeof PUBLICATION_EFFECT)[keyof typeof PUBLICATION_EFFECT];

export const PUBLICATION_QUEUE_SUFFIX = { JOBS: "jobs", RESULTS: "results" } as const;
export type PublicationQueueSuffixType =
  (typeof PUBLICATION_QUEUE_SUFFIX)[keyof typeof PUBLICATION_QUEUE_SUFFIX];
export const PUBLICATION_WITHDRAWAL = {
  RETURN: "return",
  REJECT: "reject",
  CANCEL: "cancel",
} as const;
export const PUBLICATION_FOCUS_OUTCOME = {
  SUCCESS: "success",
  FAILURE: "failure",
  MOVED: "moved-focus",
} as const;
