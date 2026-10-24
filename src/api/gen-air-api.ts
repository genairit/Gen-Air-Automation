import type {
  TaskStatusType,
  ProjectTypeNameType,
  CustomerSyncStatusType,
} from "../constants/domain.constant.ts";

import {
  buildTaskPath,
  buildCustomerPath,
  buildApartmentsPath,
  buildProjectMembersPath,
} from "../utilities/api-path.utility.ts";

import {
  isTask,
  isProject,
  isSession,
  isTaskPage,
  isCustomer,
  isTaskCounts,
  isTaskRecord,
  isUserRecord,
  isStageCounts,
  isCustomerRecord,
  isProjectTypeList,
  isProjectStageList,
  isProjectMemberList,
} from "../utilities/entity-guard.utility.ts";

import { API_PATHS } from "../constants/api.constant.ts";
import type { HttpMethodType } from "../constants/http.constant.ts";
import type { APIResponse, APIRequestContext } from "@playwright/test";
import type { UserRoleType } from "../constants/user-role.constant.ts";
import type { ICredentials } from "../interfaces/test-user.interface.ts";
import { isRecord, isNumberRecord, type TGuard } from "../utilities/guard.utility.ts";
import type { ISession, IProjectType, IProjectStage } from "../interfaces/entities.interface.ts";

type TQueryParameters = Record<string, string>;

const withQuery = (path: string, query: TQueryParameters): string =>
  `${path}?${new URLSearchParams(query)}`;

const sumCounts = (counts: Record<string, number>): number =>
  Object.values(counts).reduce((total, count) => total + count, 0);

const readJson = async <T>(response: APIResponse, isExpected: TGuard<T>): Promise<T> => {
  if (!response.ok()) {
    throw new Error(`${response.url()} answered ${response.status()}: ${await response.text()}`);
  }

  const body: unknown = await response.json();

  if (!isExpected(body)) {
    throw new Error(`${response.url()} answered an unexpected body: ${JSON.stringify(body)}`);
  }

  return body;
};

export const loginThroughApi = async (
  request: APIRequestContext,
  credentials: ICredentials,
): Promise<ISession> => {
  const response = await request.post(API_PATHS.LOGIN, {
    data: { email: credentials.email, password: credentials.password, rememberMe: true },
  });

  return readJson(response, isSession);
};

export const createGenAirApi = (request: APIRequestContext, session: ISession) => {
  const headers = { Authorization: `Bearer ${session.accessToken}` };

  const get = async <T>(path: string, isExpected: TGuard<T>) =>
    readJson(await request.get(path, { headers }), isExpected);

  const post = async <T>(path: string, data: object, isExpected: TGuard<T>) =>
    readJson(await request.post(path, { headers, data }), isExpected);

  const send = (method: HttpMethodType, path: string, data: object | null = null) =>
    request.fetch(path, { method, headers, ...(data && { data }) });

  const findProjectType = async (name: ProjectTypeNameType): Promise<IProjectType> => {
    const projectTypes = await get(API_PATHS.PROJECT_TYPE, isProjectTypeList);
    const projectType = projectTypes.find(candidate => candidate.name === name);

    if (!projectType) {
      throw new Error(`Project type "${name}" is not seeded`);
    }

    return projectType;
  };

  const findProjectStage = async (stageName: string): Promise<IProjectStage> => {
    const stages = await get(API_PATHS.PROJECT_STAGE, isProjectStageList);
    const stage = stages.find(candidate => candidate.name === stageName);

    if (!stage) {
      throw new Error(`Project stage "${stageName}" is not seeded`);
    }

    return stage;
  };

  const countProjectsInStage = async (stageName: string, search = ""): Promise<number> => {
    const stage = await findProjectStage(stageName);
    const query = new URLSearchParams({ search });
    const counts = await get(`${API_PATHS.PROJECT_STAGE_COUNTS}?${query}`, isStageCounts);

    return counts.byStage[stage.id] ?? 0;
  };

  const readRoleCounts = () => get(API_PATHS.USER_ROLE_COUNTS, isNumberRecord);

  const countUsersInRole = async (role: UserRoleType): Promise<number> => {
    const counts = await readRoleCounts();

    return counts[role] ?? 0;
  };

  const countCustomersInSyncStatus = async (
    syncStatus: CustomerSyncStatusType,
  ): Promise<number> => {
    const counts = await get(API_PATHS.CUSTOMER_SYNC_COUNTS, isNumberRecord);

    return counts[syncStatus] ?? 0;
  };

  const countMyTasksInStatus = async (status: TaskStatusType): Promise<number> => {
    const counts = await get(API_PATHS.MY_TASK_COUNTS, isTaskCounts);

    return counts.byStatus[status] ?? 0;
  };

  const countTasks = async (query: TQueryParameters): Promise<number> => {
    const counts = await get(withQuery(API_PATHS.TASK_COUNTS, query), isTaskCounts);

    return sumCounts(counts.byStatus);
  };

  const findTaskIds = async (query: TQueryParameters): Promise<string[]> => {
    const page = await get(withQuery(API_PATHS.TASK, query), isTaskPage);

    return page.items.map(task => task.id);
  };

  return {
    session,
    send,
    countTasks,
    findTaskIds,
    readRoleCounts,
    findProjectType,
    findProjectStage,
    countUsersInRole,
    countMyTasksInStatus,
    countProjectsInStage,
    countCustomersInSyncStatus,
    getTask: (taskId: string) => get(buildTaskPath(taskId), isTaskRecord),
    getTaskDetails: (taskId: string) => get(buildTaskPath(taskId), isRecord),
    createUser: (user: object) => post(API_PATHS.USER, user, isUserRecord),
    getProjectMembers: (projectId: string) =>
      get(buildProjectMembersPath(projectId), isProjectMemberList),
    createTask: (task: object) => post(API_PATHS.TASK, task, isTask),
    createProject: (project: object) => post(API_PATHS.PROJECT, project, isProject),
    createCustomer: (customer: object) => post(API_PATHS.CUSTOMER, customer, isCustomer),
    getCustomer: (customerId: string) => get(buildCustomerPath(customerId), isCustomerRecord),
    createApartment: (buildingId: string, apartment: object) =>
      post(buildApartmentsPath(buildingId), apartment, isProject),
  };
};

export type TGenAirApi = ReturnType<typeof createGenAirApi>;
