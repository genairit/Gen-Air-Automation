import {
  seedUser,
  seedCustomer,
  linkToProject,
  buildTaskInput,
  seedTaskScenario,
  buildCustomerInput,
  seedStandaloneProject,
  buildStandaloneProjectInput,
} from "./seed-data.ts";

import {
  buildTaskPath,
  buildProjectPath,
  buildCustomerPath,
  buildTaskActionPath,
  buildProjectStagePath,
} from "../utilities/api-path.utility.ts";

import type { TGenAirApi } from "./gen-air-api.ts";
import type { APIResponse } from "@playwright/test";
import { HTTP_METHODS } from "../constants/http.constant.ts";
import { USER_ROLES } from "../constants/user-role.constant.ts";
import { createUniqueName } from "../utilities/test-data.utility.ts";
import { API_PATHS, API_SEGMENTS } from "../constants/api.constant.ts";
import type { IRoleAccess } from "../interfaces/role-access.interface.ts";
import { TASK_STATUSES, PROJECT_STATUS_NAMES } from "../constants/domain.constant.ts";

interface IPermissionContext {
  admin: TGenAirApi;
  actor: TGenAirApi;
}

export interface IPermissionAction {
  name: string;
  permission: keyof IRoleAccess;
  perform: (context: IPermissionContext) => Promise<APIResponse>;
}

const RENAMED_PREFIX = "שם מעודכן";

const seedProjectFor = async (admin: TGenAirApi) =>
  seedStandaloneProject(admin, await seedCustomer(admin));

const seedTaskFor = async (admin: TGenAirApi) => (await seedTaskScenario(admin)).task;

const createProject = async ({ admin, actor }: IPermissionContext) =>
  actor.send(
    HTTP_METHODS.POST,
    API_PATHS.PROJECT,
    await buildStandaloneProjectInput(admin, await seedCustomer(admin)),
  );

const editProject = async ({ admin, actor }: IPermissionContext) => {
  const project = await seedProjectFor(admin);

  return actor.send(HTTP_METHODS.PATCH, buildProjectPath(project.id), {
    name: createUniqueName(RENAMED_PREFIX),
  });
};

const deleteProject = async ({ admin, actor }: IPermissionContext) => {
  const project = await seedProjectFor(admin);

  return actor.send(HTTP_METHODS.DELETE, buildProjectPath(project.id));
};

const moveProjectStage = async ({ admin, actor }: IPermissionContext) => {
  const project = await seedProjectFor(admin);
  const stage = await admin.findProjectStage(PROJECT_STATUS_NAMES.IN_PROGRESS);

  return actor.send(HTTP_METHODS.PATCH, buildProjectStagePath(project.id), {
    stageId: stage.id,
  });
};

const createCustomer = ({ actor }: IPermissionContext) =>
  actor.send(HTTP_METHODS.POST, API_PATHS.CUSTOMER, buildCustomerInput());

const updateCustomer = async ({ admin, actor }: IPermissionContext) => {
  const customer = await seedCustomer(admin);

  return actor.send(HTTP_METHODS.PATCH, buildCustomerPath(customer.id), {
    name: createUniqueName(RENAMED_PREFIX),
  });
};

const deleteCustomer = async ({ admin, actor }: IPermissionContext) => {
  const customer = await seedCustomer(admin);

  return actor.send(HTTP_METHODS.DELETE, buildCustomerPath(customer.id));
};

const createTask = async ({ admin, actor }: IPermissionContext) => {
  const project = await seedProjectFor(admin);
  const link = linkToProject(project);

  return actor.send(HTTP_METHODS.POST, API_PATHS.TASK, buildTaskInput({ link }));
};

const editTask = async ({ admin, actor }: IPermissionContext) => {
  const task = await seedTaskFor(admin);

  return actor.send(HTTP_METHODS.PATCH, buildTaskPath(task.id), {
    title: createUniqueName(RENAMED_PREFIX),
  });
};

const assignTask = async ({ admin, actor }: IPermissionContext) => {
  const task = await seedTaskFor(admin);
  const engineer = await seedUser(admin, USER_ROLES.ENGINEER);

  return actor.send(HTTP_METHODS.PATCH, buildTaskPath(task.id), { assigneeId: engineer.id });
};

const markTaskUrgent = async ({ admin, actor }: IPermissionContext) => {
  const task = await seedTaskFor(admin);

  return actor.send(HTTP_METHODS.PATCH, buildTaskActionPath(task.id, API_SEGMENTS.URGENCY), {
    isUrgent: true,
  });
};

const deleteTask = async ({ admin, actor }: IPermissionContext) => {
  const task = await seedTaskFor(admin);

  return actor.send(HTTP_METHODS.DELETE, buildTaskPath(task.id));
};

const claimTask = async ({ admin, actor }: IPermissionContext) => {
  const task = await seedTaskFor(admin);

  return actor.send(HTTP_METHODS.PATCH, buildTaskActionPath(task.id, API_SEGMENTS.CLAIM));
};

const changeTaskStatus = async ({ admin, actor }: IPermissionContext) => {
  const task = await seedTaskFor(admin);

  return actor.send(HTTP_METHODS.PATCH, buildTaskActionPath(task.id, API_SEGMENTS.STATUS), {
    status: TASK_STATUSES.IN_PROGRESS,
  });
};

export const PERMISSION_ACTIONS: IPermissionAction[] = [
  { name: "create a project", permission: "canCreateProject", perform: createProject },
  { name: "edit a project", permission: "canEditProject", perform: editProject },
  { name: "delete a project", permission: "canDeleteProject", perform: deleteProject },
  { name: "move a project status", permission: "canMoveProjectStage", perform: moveProjectStage },
  { name: "create a customer", permission: "canManageCustomers", perform: createCustomer },
  { name: "update a customer", permission: "canManageCustomers", perform: updateCustomer },
  { name: "delete a customer", permission: "canManageCustomers", perform: deleteCustomer },
  { name: "create a task", permission: "canManageTasks", perform: createTask },
  { name: "edit a task", permission: "canManageTasks", perform: editTask },
  { name: "assign a task", permission: "canManageTasks", perform: assignTask },
  { name: "set a task's urgency", permission: "canManageTasks", perform: markTaskUrgent },
  { name: "delete a task", permission: "canManageTasks", perform: deleteTask },
  { name: "claim a task", permission: "canClaimTasks", perform: claimTask },
  { name: "change a task status", permission: "canChangeTaskStatus", perform: changeTaskStatus },
];
