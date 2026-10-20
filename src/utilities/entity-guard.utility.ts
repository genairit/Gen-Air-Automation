import {
  isRecord,
  createArrayGuard,
  createStringFieldsGuard,
  createNestedNumberRecordGuard,
} from "./guard.utility.ts";

import type {
  ITask,
  IUser,
  IProject,
  ISession,
  ICustomer,
  ITaskCounts,
  ITaskRecord,
  IUserRecord,
  IStageCounts,
  IProjectType,
  IProjectStage,
  IProjectMember,
  ICustomerRecord,
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

export const isTaskRecord = (value: unknown): value is ITaskRecord => {
  const hasTaskFields = isTask(value);
  const assigneeId = isRecord(value) ? value.assigneeId : null;
  const hasNullableAssignee = assigneeId === null || typeof assigneeId === "string";

  return hasTaskFields && hasNullableAssignee;
};

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
