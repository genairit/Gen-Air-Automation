import type { Response } from "@playwright/test";
import { buildTaskPath } from "./api-path.utility.ts";
import { HTTP_METHODS } from "../constants/http.constant.ts";

export const isTaskUpdateResponse =
  (taskId: string) =>
  (response: Response): boolean => {
    const isTaskEndpoint = response.url().endsWith(buildTaskPath(taskId));
    const isUpdate = response.request().method() === HTTP_METHODS.PATCH;

    return isTaskEndpoint && isUpdate;
  };
