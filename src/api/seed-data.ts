import {
  SEED_VALUES,
  SEED_NAME_PREFIXES,
  SEED_EMAIL_PREFIXES,
} from "../constants/seed.constant.ts";

import {
  CONTACT_ROLES,
  PAYMENT_TERMS,
  CUSTOMER_TYPES,
  PROJECT_TYPE_NAMES,
  type ProjectTypeNameType,
} from "../constants/domain.constant.ts";

import {
  createUniqueName,
  createMobilePhone,
  createUniqueEmail,
  createCompanyNumber,
  createSequenceNumber,
} from "../utilities/test-data.utility.ts";

import type { TGenAirApi } from "./gen-air-api.ts";
import { FAKE_PLACES } from "../constants/fake-places.constant.ts";
import { TEST_PASSWORD } from "../constants/test-users.constant.ts";
import type { UserRoleType } from "../constants/user-role.constant.ts";
import type { ITask, IUser, IProject, ICustomer } from "../interfaces/entities.interface.ts";

interface ISeedTaskOptions {
  project: IProject;
  customer: ICustomer;
  assigneeId?: string;
}

interface IProjectMemberInput {
  userId: string;
  role: UserRoleType;
}

interface ISeedProjectOptions {
  customer: ICustomer;
  members?: IProjectMemberInput[];
  projectTypeName: ProjectTypeNameType;
}

interface IProjectInputOptions {
  customer: ICustomer;
  projectTypeId: string;
  members?: IProjectMemberInput[];
}

interface ISeededUser extends IUser {
  password: string;
  role: UserRoleType;
}

interface ITaskScenario {
  task: ITask;
  project: IProject;
  customer: ICustomer;
}

export const buildUserInput = (role: UserRoleType) => ({
  role,
  password: TEST_PASSWORD,
  phone: createMobilePhone(),
  lastName: SEED_VALUES.EMPLOYEE_LAST_NAME,
  firstName: createUniqueName(SEED_NAME_PREFIXES.EMPLOYEE),
  email: createUniqueEmail(SEED_EMAIL_PREFIXES.EMPLOYEE),
});

export const seedUser = async (api: TGenAirApi, role: UserRoleType): Promise<ISeededUser> => {
  const input = buildUserInput(role);
  const user = await api.createUser(input);

  return { ...user, role, password: input.password };
};

export const buildCustomerInput = () => ({
  taxId: createCompanyNumber(),
  phone: SEED_VALUES.CUSTOMER_PHONE,
  customerType: CUSTOMER_TYPES.COMPANY,
  address: SEED_VALUES.CUSTOMER_ADDRESS,
  contactName: SEED_VALUES.CUSTOMER_CONTACT_NAME,
  name: createUniqueName(SEED_NAME_PREFIXES.CUSTOMER),
  email: createUniqueEmail(SEED_EMAIL_PREFIXES.CUSTOMER),
});

export const seedCustomer = (api: TGenAirApi): Promise<ICustomer> =>
  api.createCustomer(buildCustomerInput());

export const buildProjectInput = (options: IProjectInputOptions) => ({
  members: options.members ?? [],
  projectTypeId: options.projectTypeId,
  contactPhone: createMobilePhone(),
  customerId: options.customer.id,
  addressPlaceId: FAKE_PLACES[0].placeId,
  contactRole: CONTACT_ROLES.PROJECT_MANAGER,
  paymentTerms: PAYMENT_TERMS.MILESTONES_NET_60,
  contactName: SEED_VALUES.PROJECT_CONTACT_NAME,
  name: createUniqueName(SEED_NAME_PREFIXES.PROJECT),
});

export const buildStandaloneProjectInput = async (
  api: TGenAirApi,
  customer: ICustomer,
  members: IProjectMemberInput[] = [],
) => {
  const projectType = await api.findProjectType(PROJECT_TYPE_NAMES.COMMERCIAL);

  return buildProjectInput({ customer, members, projectTypeId: projectType.id });
};

export const seedProject = async (
  api: TGenAirApi,
  options: ISeedProjectOptions,
): Promise<IProject> => {
  const projectType = await api.findProjectType(options.projectTypeName);

  return api.createProject(buildProjectInput({ ...options, projectTypeId: projectType.id }));
};

export const seedBuilding = (api: TGenAirApi, customer: ICustomer): Promise<IProject> =>
  seedProject(api, { customer, projectTypeName: PROJECT_TYPE_NAMES.RESIDENTIAL_BUILDING });

export const seedStandaloneProject = (api: TGenAirApi, customer: ICustomer): Promise<IProject> =>
  seedProject(api, { customer, projectTypeName: PROJECT_TYPE_NAMES.COMMERCIAL });

export const seedApartment = (api: TGenAirApi, building: IProject): Promise<IProject> =>
  api.createApartment(building.id, {
    contactPhone: createMobilePhone(),
    customerFloor: SEED_VALUES.APARTMENT_FLOOR,
    contactName: SEED_VALUES.APARTMENT_CONTACT_NAME,
    customerApartment: String(createSequenceNumber()),
  });

export const buildTaskInput = (options: ISeedTaskOptions) => ({
  dueDate: SEED_VALUES.DUE_DATE,
  projectId: options.project.id,
  customerId: options.customer.id,
  assigneeId: options.assigneeId ?? null,
  description: SEED_VALUES.TASK_DESCRIPTION,
  title: createUniqueName(SEED_NAME_PREFIXES.TASK),
});

export const seedTask = (api: TGenAirApi, options: ISeedTaskOptions): Promise<ITask> =>
  api.createTask(buildTaskInput(options));

export const seedTaskScenario = async (
  api: TGenAirApi,
  assigneeId: string | null = null,
): Promise<ITaskScenario> => {
  const customer = await seedCustomer(api);
  const project = await seedStandaloneProject(api, customer);
  const task = await seedTask(api, { project, customer, ...(assigneeId && { assigneeId }) });

  return { task, project, customer };
};
