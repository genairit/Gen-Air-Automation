import {
  buildProjectPath,
  buildApartmentsPath,
  buildProjectStagePath,
} from "../utilities/api-path.utility.ts";

import type { TGenAirApi } from "./gen-air-api.ts";
import { expect, type APIResponse } from "@playwright/test";
import { HTTP_METHODS, HTTP_STATUS } from "../constants/http.constant.ts";
import { WAITING_REASON_ERROR } from "../constants/stage-reason.constant.ts";
import { isRecord, createArrayGuard, createNullableGuard } from "../utilities/guard.utility.ts";

export interface IWaitingReasonProject {
  id: string;
  stageId: string;
  waitingReason: string | null;
}

export interface IStageTransitionNote {
  id: string;
  toStageId: string;
  note: string | null;
  toStage: { name: string } | null;
}

const PROJECT_TRANSITIONS_PATH = "/project-stage-transition/by-project";

const isNullableString = createNullableGuard(
  (value: unknown): value is string => typeof value === "string",
);

const isWaitingReasonProject = (value: unknown): value is IWaitingReasonProject =>
  isRecord(value) &&
  typeof value.id === "string" &&
  typeof value.stageId === "string" &&
  "waitingReason" in value &&
  isNullableString(value.waitingReason);

const isTransitionNote = (value: unknown): value is IStageTransitionNote =>
  isRecord(value) &&
  typeof value.id === "string" &&
  typeof value.toStageId === "string" &&
  "note" in value &&
  isNullableString(value.note) &&
  "toStage" in value &&
  (value.toStage === null || (isRecord(value.toStage) && typeof value.toStage.name === "string"));

const readBody = async <T>(
  response: APIResponse,
  isExpected: (value: unknown) => value is T,
): Promise<T> => {
  expect(response.status(), await response.text()).toBe(HTTP_STATUS.OK);
  const body: unknown = await response.json();

  if (!isExpected(body)) {
    throw new Error(`${response.url()} answered an unexpected body: ${JSON.stringify(body)}`);
  }

  return body;
};

const isWaitingReasonList = createArrayGuard(isWaitingReasonProject);

const isWaitingReasonPage = (value: unknown): value is { items: IWaitingReasonProject[] } =>
  isRecord(value) && isWaitingReasonList(value.items);

const isTransitionNoteList = createArrayGuard(isTransitionNote);

const readItems = async (response: APIResponse): Promise<IWaitingReasonProject[]> =>
  (await readBody(response, isWaitingReasonPage)).items;

export const buildProjectTransitionsPath = (projectId: string): string =>
  `${PROJECT_TRANSITIONS_PATH}/${projectId}`;

export const sendStageMove = (api: TGenAirApi, projectId: string, body: object) =>
  api.send(HTTP_METHODS.PATCH, buildProjectStagePath(projectId), body);

export const sendProjectUpdate = (api: TGenAirApi, projectId: string, body: object) =>
  api.send(HTTP_METHODS.PATCH, buildProjectPath(projectId), body);

export const readWaitingReasonResponse = (response: APIResponse) =>
  readBody(response, isWaitingReasonProject);

export const readWaitingReasonProject = async (api: TGenAirApi, projectId: string) =>
  readWaitingReasonResponse(await api.send(HTTP_METHODS.GET, buildProjectPath(projectId)));

export const readBoardItems = async (api: TGenAirApi, search: string) =>
  readItems(await api.send(HTTP_METHODS.GET, `/project?${new URLSearchParams({ search })}`));

export const readApartmentItems = async (api: TGenAirApi, buildingId: string) =>
  readItems(await api.send(HTTP_METHODS.GET, buildApartmentsPath(buildingId)));

export const readTransitionNotes = async (
  api: TGenAirApi,
  projectId: string,
): Promise<IStageTransitionNote[]> => {
  const response = await api.send(HTTP_METHODS.GET, buildProjectTransitionsPath(projectId));

  return readBody(response, isTransitionNoteList);
};

export const moveWithReason = async (
  api: TGenAirApi,
  projectId: string,
  move: { stageId: string; note?: string },
) => readWaitingReasonResponse(await sendStageMove(api, projectId, move));

export const expectWaitingReasonRequired = async (response: APIResponse): Promise<void> => {
  expect(response.status()).toBe(HTTP_STATUS.BAD_REQUEST);
  expect(await response.json()).toMatchObject({
    code: WAITING_REASON_ERROR.CODE,
    message: WAITING_REASON_ERROR.MESSAGE,
  });
};
