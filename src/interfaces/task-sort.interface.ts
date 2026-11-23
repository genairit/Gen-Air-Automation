import type { ITask } from "./entities.interface.ts";
import type { TGenAirApi } from "../api/gen-air-api.ts";
import type { Request, Locator } from "@playwright/test";
import type { ICredentials } from "./test-user.interface.ts";
import type { TaskStatusType } from "../constants/domain.constant.ts";
import type { TaskSortModeType } from "../constants/task-sort.constant.ts";

export interface ITaskSortRow extends ITask {
  isUrgent: boolean;
  dueDate: string | null;
  status: TaskStatusType;
  assigneeId: string | null;
}

export interface ITaskSortPage {
  items: ITaskSortRow[];
  nextCursor: string | null;
}

export interface ITaskSortScenario {
  prefix: string;
  projectId: string;
  rows: ITaskSortRow[];
  engineer: ICredentials;
  foreignAssigneeId: string;
}

export interface ITaskSortQuery {
  [key: string]: string;
}

export interface ITaskSortTraversal {
  api: TGenAirApi;
  query: ITaskSortQuery;
}

export interface ITaskSortDelay {
  started: Promise<void>;
  dispose: () => Promise<void>;
  releaseAndWaitForApplication: () => Promise<void>;
}

export interface ITaskSortRequest {
  sort: string;
  cursor: string | null;
}

export interface ITaskSortMonitor {
  dispose: () => void;
  requests: ITaskSortRequest[];
}

export interface ITaskSortRequestState {
  failed: boolean;
  failure: unknown;
  request: Request | null;
}

export interface ITaskSortFailure {
  recover: () => void;
  dispose: () => Promise<void>;
}

export interface ITaskSortView {
  sort: Locator;
  retry: Locator;
  search: Locator;
  titles: Locator;
  goto: () => Promise<void>;
  choose: (mode: TaskSortModeType) => Promise<void>;
  expectAll: (rows: ITaskSortRow[]) => Promise<void>;
  chooseByKeyboard: (mode: TaskSortModeType) => Promise<void>;
}
