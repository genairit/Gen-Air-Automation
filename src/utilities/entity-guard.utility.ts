import {
  isRecord,
  createArrayGuard,
  createNullableGuard,
  createStringFieldsGuard,
  createNestedNumberRecordGuard,
} from "./guard.utility.ts";

import type {
  ITask,
  IUser,
  IProject,
  ISession,
  ICustomer,
  ITaskPage,
  ITaskCounts,
  ITaskRecord,
  IUserRecord,
  ITaskProject,
  IStageCounts,
  IProjectType,
  IProjectStage,
  IProjectMember,
  ICustomerRecord,
  ITaskParentProject,
  ITaskCustomerReference,
} from "../interfaces/entities.interface.ts";

export const isTask = createStringFieldsGuard<ITask>(["id", "title"]);

export const isUser = createStringFieldsGuard<IUser>(["id", "email", "firstName", "lastName"]);

export const isUserRecord = createStringFieldsGuard<IUserRecord>([
  "id",
  "role",
  "email",
  "firstName",
  "lastName",
]);

const NULLABLE_TASK_STRINGS = ["projectId", "assigneeId", "customerId", "description"] as const;

const isNullableString = createNullableGuard(
  (value: unknown): value is string => typeof value === "string",
);

const isNullableCustomerReference = createNullableGuard(
  createStringFieldsGuard<ITaskCustomerReference>(["id", "name"]),
);

const isTaskParentProject = (value: unknown): value is ITaskParentProject =>
  isRecord(value) && typeof value.id === "string" && isNullableCustomerReference(value.customer);

const isTaskProject = (value: unknown): value is ITaskProject =>
  isRecord(value) &&
  isTaskParentProject(value) &&
  createNullableGuard(isTaskParentProject)(value.parentProject);

const hasNullableTaskStrings = (value: unknown): boolean =>
  isRecord(value) && NULLABLE_TASK_STRINGS.every(field => isNullableString(value[field]));

const hasNullableTaskLinks = (value: unknown): boolean =>
  isRecord(value) &&
  createNullableGuard(isTaskProject)(value.project) &&
  isNullableCustomerReference(value.customer);

export const isTaskRecord = (value: unknown): value is ITaskRecord =>
  isTask(value) && hasNullableTaskStrings(value) && hasNullableTaskLinks(value);

export const isTaskPage = (value: unknown): value is ITaskPage =>
  isRecord(value) && createArrayGuard(isTask)(value.items);

export const isProjectMemberList = createArrayGuard(
  createStringFieldsGuard<IProjectMember>(["role", "userId"]),
);

export const isProject = createStringFieldsGuard<IProject>(["id", "name", "code"]);

export const isProjectType = createStringFieldsGuard<IProjectType>(["id", "name"]);

export const isProjectTypeList = createArrayGuard(isProjectType);

export const isCustomer = createStringFieldsGuard<ICustomer>([
  "id",
  "name",
  "taxId",
  "contactName",
]);

export const isCustomerRecord = createStringFieldsGuard<ICustomerRecord>([
  "id",
  "name",
  "taxId",
  "contactName",
  "customerType",
  "prioritySyncStatus",
]);

export const isSession = (value: unknown): value is ISession =>
  isRecord(value) && typeof value.accessToken === "string" && isUser(value.user);

export const isProjectStageList = createArrayGuard(
  createStringFieldsGuard<IProjectStage>(["id", "name"]),
);

export const isStageCounts = createNestedNumberRecordGuard<IStageCounts>("byStage");

export const isTaskCounts = createNestedNumberRecordGuard<ITaskCounts>("byStatus");
