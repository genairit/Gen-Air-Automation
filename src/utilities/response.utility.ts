import { buildTaskPath } from "./api-path.utility.ts";
import type { Request, Response } from "@playwright/test";
import { HTTP_METHODS } from "../constants/http.constant.ts";
import { API_PATHS, API_PROXY_PREFIX } from "../constants/api.constant.ts";

export const isTaskUpdateResponse =
  (taskId: string) =>
  (response: Response): boolean => {
    const isTaskEndpoint = response.url().endsWith(buildTaskPath(taskId));
    const isUpdate = response.request().method() === HTTP_METHODS.PATCH;

    return isTaskEndpoint && isUpdate;
  };

export const isTaskCreationRequest = (request: Request): boolean => {
  const isTaskCollection =
    new URL(request.url()).pathname === `${API_PROXY_PREFIX}${API_PATHS.TASK}`;
  const isCreation = request.method() === HTTP_METHODS.POST;

  return isTaskCollection && isCreation;
};
