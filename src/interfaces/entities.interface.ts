export interface IEntityReference {
  id: string;
}

export interface ITask extends IEntityReference {
  title: string;
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
  user: IUser;
  accessToken: string;
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
