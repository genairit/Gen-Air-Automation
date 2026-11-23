import {
  TASK_SORT_MODES,
  TASK_SORT_FIXTURE,
  type TaskSortModeType,
} from "../constants/task-sort.constant.ts";

import type {
  ITaskSortRow,
  ITaskSortPage,
  ITaskSortQuery,
  ITaskSortScenario,
  ITaskSortTraversal,
} from "../interfaces/task-sort.interface.ts";

import type { TGenAirApi } from "./gen-air-api.ts";
import type { APIResponse } from "@playwright/test";
import { isRecord } from "../utilities/guard.utility.ts";
import { HTTP_METHODS } from "../constants/http.constant.ts";
import { USER_ROLES } from "../constants/user-role.constant.ts";
import { TASK_STATUSES } from "../constants/domain.constant.ts";
import { createUniqueName } from "../utilities/test-data.utility.ts";
import { setTaskSortFixtures } from "../environment/task-sort-fixtures.ts";
import { seedUser, seedCustomer, seedStandaloneProject } from "./seed-data.ts";

const isNullableString = (value: unknown): value is string | null =>
  value === null || typeof value === "string";

const isTaskSortRow = (value: unknown): value is ITaskSortRow => {
  if (!isRecord(value)) {
    return false;
  }

  const validId = typeof value.id === "string";
  const validTitle = typeof value.title === "string";
  const validUrgency = typeof value.isUrgent === "boolean";
  const validDueDate = isNullableString(value.dueDate);
  const validAssignee = isNullableString(value.assigneeId);
  const validStatus = Object.values(TASK_STATUSES).some(status => status === value.status);
  return validId && validTitle && validUrgency && validDueDate && validAssignee && validStatus;
};

const isTaskSortPage = (value: unknown): value is ITaskSortPage => {
  if (!isRecord(value)) {
    return false;
  }

  const validRows = Array.isArray(value.items) && value.items.every(isTaskSortRow);
  const validCursor = isNullableString(value.nextCursor);
  return validRows && validCursor;
};

export const taskSortPage = async (response: APIResponse): Promise<ITaskSortPage> => {
  const value: unknown = await response.json();
  if (!response.ok() || !isTaskSortPage(value)) {
    throw new Error("Invalid task page: " + response.status() + " " + JSON.stringify(value));
  }

  return value;
};

export const taskSortPath = (query: ITaskSortQuery): string =>
  TASK_SORT_FIXTURE.ENDPOINT + "?" + new URLSearchParams(query).toString();

export const readTaskSortPage = (api: TGenAirApi, query: ITaskSortQuery): Promise<ITaskSortPage> =>
  api.send(HTTP_METHODS.GET, taskSortPath(query)).then(taskSortPage);

export const traverseTaskSortPages = async (
  options: ITaskSortTraversal,
): Promise<ITaskSortRow[]> => {
  const rows: ITaskSortRow[] = [];
  const state: { cursor: string | null } = { cursor: null };
  for (const _ of Array.from({ length: TASK_SORT_FIXTURE.MAX_PAGES })) {
    const query = { ...options.query, batchSize: String(TASK_SORT_FIXTURE.PAGE_SIZE) };
    const page = await readTaskSortPage(options.api, {
      ...query,
      ...(state.cursor && { batchCursor: state.cursor }),
    });
    if (page.items.length > TASK_SORT_FIXTURE.PAGE_SIZE) {
      throw new Error("Task pagination exceeded the requested batch size");
    }

    rows.push(...page.items);
    if (page.nextCursor === null) {
      return rows;
    }

    state.cursor = page.nextCursor;
  }

  throw new Error("Task pagination did not terminate");
};

export const sortTaskRows = (rows: ITaskSortRow[], mode: TaskSortModeType): ITaskSortRow[] =>
  [...rows].sort((left, right) => {
    const urgencyDiffers = left.isUrgent !== right.isUrgent;
    if (mode === TASK_SORT_MODES.DEFAULT && urgencyDiffers) {
      return Number(right.isUrgent) - Number(left.isUrgent);
    }

    if (left.dueDate === right.dueDate) {
      return left.id.localeCompare(right.id);
    }

    if (left.dueDate === null) {
      return 1;
    }

    if (right.dueDate === null) {
      return -1;
    }

    const direction = mode === TASK_SORT_MODES.LATEST ? -1 : 1;
    return left.dueDate.localeCompare(right.dueDate) * direction;
  });

export const seedTaskSortScenario = async (api: TGenAirApi): Promise<ITaskSortScenario> => {
  const engineer = await seedUser(api, USER_ROLES.ENGINEER);
  const foreign = await seedUser(api, USER_ROLES.ENGINEER);
  const customer = await seedCustomer(api);
  const project = await seedStandaloneProject(api, customer);
  const prefix = createUniqueName(TASK_SORT_FIXTURE.PREFIX);
  const rows: ITaskSortRow[] = [];
  for (const [index, dueDate] of TASK_SORT_FIXTURE.DATES.entries()) {
    const task = await api.createTask({
      dueDate: null,
      projectId: project.id,
      assigneeId: engineer.id,
      description: "בדיקת סדר משימות",
      title: prefix + " " + String(index).padStart(TASK_SORT_FIXTURE.TITLE_DIGITS, "0"),
    });
    const isPeriodicUrgent = index % TASK_SORT_FIXTURE.URGENCY_INTERVAL === 0;
    const isUrgentUndated = dueDate === null && index === TASK_SORT_FIXTURE.URGENT_UNDATED_INDEX;
    const isUrgent = isPeriodicUrgent || isUrgentUndated;
    rows.push({
      ...task,
      dueDate,
      assigneeId: engineer.id,
      isUrgent,
      status:
        index % TASK_SORT_FIXTURE.STATUS_INTERVAL === 0
          ? TASK_STATUSES.NOT_STARTED
          : TASK_STATUSES.IN_PROGRESS,
    });
  }

  await setTaskSortFixtures(rows);
  for (const assigneeId of [foreign.id, null]) {
    await api.createTask({
      assigneeId,
      dueDate: null,
      projectId: project.id,
      description: "משימה שאינה שלי",
      title: prefix + " זר " + String(assigneeId),
    });
  }

  return { rows, prefix, engineer, projectId: project.id, foreignAssigneeId: foreign.id };
};
