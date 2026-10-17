import type {
  TaskStatusType,
  ProjectTypeNameType,
  CustomerSyncStatusType,
} from "../constants/domain.constant.ts";

import {
  isTask,
  isUser,
  isProject,
  isSession,
  isCustomer,
  isTaskCounts,
  isStageCounts,
  isProjectTypeList,
  isProjectStageList,
} from "../utilities/entity-guard.utility.ts";

import { API_PATHS } from "../constants/api.constant.ts";
import { buildApartmentsPath } from "../utilities/api-path.utility.ts";
import type { APIResponse, APIRequestContext } from "@playwright/test";
import type { UserRoleType } from "../constants/user-role.constant.ts";
import type { ICredentials } from "../interfaces/test-user.interface.ts";
import { isNumberRecord, type TGuard } from "../utilities/guard.utility.ts";
import type { ISession, IProjectType } from "../interfaces/entities.interface.ts";

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

  const findProjectType = async (name: ProjectTypeNameType): Promise<IProjectType> => {
    const projectTypes = await get(API_PATHS.PROJECT_TYPE, isProjectTypeList);
    const projectType = projectTypes.find(candidate => candidate.name === name);

    if (!projectType) {
      throw new Error(`Project type "${name}" is not seeded`);
    }

    return projectType;
  };

  const countProjectsInStage = async (stageName: string): Promise<number> => {
    const stages = await get(API_PATHS.PROJECT_STAGE, isProjectStageList);
    const counts = await get(API_PATHS.PROJECT_STAGE_COUNTS, isStageCounts);
    const stage = stages.find(candidate => candidate.name === stageName);

    if (!stage) {
      throw new Error(`Project stage "${stageName}" is not seeded`);
    }

    return counts.byStage[stage.id] ?? 0;
  };

  const countUsersInRole = async (role: UserRoleType): Promise<number> => {
    const counts = await get(API_PATHS.USER_ROLE_COUNTS, isNumberRecord);

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

  return {
    session,
    findProjectType,
    countUsersInRole,
    countMyTasksInStatus,
    countProjectsInStage,
    countCustomersInSyncStatus,
    createUser: (user: object) => post(API_PATHS.USER, user, isUser),
    createTask: (task: object) => post(API_PATHS.TASK, task, isTask),
    createProject: (project: object) => post(API_PATHS.PROJECT, project, isProject),
    createCustomer: (customer: object) => post(API_PATHS.CUSTOMER, customer, isCustomer),
    createApartment: (buildingId: string, apartment: object) =>
      post(buildApartmentsPath(buildingId), apartment, isProject),
  };
};

export type TGenAirApi = ReturnType<typeof createGenAirApi>;
