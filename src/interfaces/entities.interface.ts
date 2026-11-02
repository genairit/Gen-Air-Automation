import type { TaskType, TaskStatusType } from "../constants/domain.constant.ts";

export interface IEntityReference {
  id: string;
}

export interface ITask extends IEntityReference {
  title: string;
}

export interface ITaskCustomerReference extends IEntityReference {
  name: string;
}

export interface ITaskParentProject extends IEntityReference {
  customer: ITaskCustomerReference | null;
}

export interface ITaskProject extends ITaskParentProject {
  parentProject: ITaskParentProject | null;
}

export interface ITaskRecord extends ITask {
  isUrgent: boolean;
  taskType: TaskType;
  status: TaskStatusType;
  dueDate: string | null;
  projectId: string | null;
  assigneeId: string | null;
  customerId: string | null;
  description: string | null;
  project: ITaskProject | null;
  customer: ITaskCustomerReference | null;
}

export interface ITaskPage {
  items: ITask[];
}

export interface IProjectMember {
  role: string;
  userId: string;
}

export interface IUserRecord extends IUser {
  role: string;
}

export interface IProjectType extends IEntityReference {
  name: string;
}

export interface IProject extends IEntityReference {
  name: string;
  code: string;
}

export interface IUser extends IEntityReference {
  email: string;
  lastName: string;
  firstName: string;
}

export interface ICustomer extends IEntityReference {
  name: string;
  taxId: string;
  contactName: string;
}

export interface ICustomerRecord extends ICustomer {
  customerType: string;
  prioritySyncStatus: string;
}

export interface ISession {
  accessToken: string;
  user: IAuthorizedUser;
}

export interface IProjectStage extends IEntityReference {
  name: string;
}

export type TCountsByKey = Record<string, number>;

export interface IStageCounts {
  byStage: TCountsByKey;
}

export interface ITaskCounts {
  byStatus: TCountsByKey;
}

export interface IAuthorizedUser extends IUser {
  role: string;
  permissions: string[];
}

export interface IDetailedTaskPage {
  items: ITaskRecord[];
}
export interface ITaskTransition {
  toStatus: string;
  fromStatus: string | null;
}
export interface IProjectRecord extends IProject {
  stage: IProjectStage;
}
