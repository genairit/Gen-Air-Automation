import {
  SEED_VALUES,
  SEED_NAME_PREFIXES,
  SEED_EMAIL_PREFIXES,
} from "../constants/seed.constant.ts";

import {
  insertLegacyCustomerTask,
  linkTaskCustomerBypassingApi,
} from "../environment/legacy-data.ts";

import {
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
import { recreateLegacyApartment } from "../environment/apartment-legacy-data.ts";
import type { ITask, IUser, IProject, ICustomer } from "../interfaces/entities.interface.ts";

export type TTaskLinkInput = { projectId: string };

type TOwnedProjectSeeder = (api: TGenAirApi, owner: ICustomer) => Promise<IProject>;

interface ILegacyTaskScenario {
  task: ITask;
  project: IProject;
  storedCustomer: ICustomer;
  projectCustomer: ICustomer;
}

interface ISeedTaskOptions {
  assigneeId?: string;
  link: TTaskLinkInput;
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

export const seedCustomers = async (api: TGenAirApi, count: number): Promise<ICustomer[]> => {
  const customers: ICustomer[] = [];

  for (const _ of Array.from({ length: count })) {
    customers.push(await seedCustomer(api));
  }

  return customers;
};

export const buildProjectInput = (options: IProjectInputOptions) => ({
  members: options.members ?? [],
  projectTypeId: options.projectTypeId,
  customerId: options.customer.id,
  addressPlaceId: FAKE_PLACES[0].placeId,
  paymentTerms: PAYMENT_TERMS.MILESTONES_NET_60,
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

export const seedApartment = async (api: TGenAirApi, building: IProject): Promise<IProject> => {
  const customer = await seedCustomer(api);
  return api.createApartment(building.id, {
    customerId: customer.id,
    customerFloor: SEED_VALUES.APARTMENT_FLOOR,
    customerApartment: String(createSequenceNumber()),
  });
};

export const seedLegacyApartment = async (
  api: TGenAirApi,
  building: IProject,
): Promise<IProject> => {
  const apartment = await seedApartment(api, building);
  await recreateLegacyApartment(apartment.id);
  return apartment;
};

export const linkToProject = (project: IProject): TTaskLinkInput => ({ projectId: project.id });

export const buildUnlinkedTaskInput = (assigneeId: string | null = null) => ({
  assigneeId,
  dueDate: SEED_VALUES.DUE_DATE,
  description: SEED_VALUES.TASK_DESCRIPTION,
  title: createUniqueName(SEED_NAME_PREFIXES.TASK),
});

export const buildTaskInput = (options: ISeedTaskOptions) => ({
  ...options.link,
  ...buildUnlinkedTaskInput(options.assigneeId ?? null),
});

export const seedTask = (api: TGenAirApi, options: ISeedTaskOptions): Promise<ITask> =>
  api.createTask(buildTaskInput(options));

export const OWNED_PROJECT_SEEDERS = {
  "standalone project": seedStandaloneProject,
  apartment: async (api, owner) => seedLegacyApartment(api, await seedBuilding(api, owner)),
} as const satisfies Record<string, TOwnedProjectSeeder>;

export const seedLegacyTaskScenario = async (
  api: TGenAirApi,
  seedProject: TOwnedProjectSeeder,
): Promise<ILegacyTaskScenario> => {
  const projectCustomer = await seedCustomer(api);
  const storedCustomer = await seedCustomer(api);
  const project = await seedProject(api, projectCustomer);
  const task = await seedTask(api, { link: linkToProject(project) });

  await linkTaskCustomerBypassingApi(task.id, storedCustomer.id);

  return { task, project, storedCustomer, projectCustomer };
};

export const seedTaskScenario = async (
  api: TGenAirApi,
  assigneeId: string | null = null,
): Promise<ITaskScenario> => {
  const customer = await seedCustomer(api);
  const project = await seedStandaloneProject(api, customer);
  const link = linkToProject(project);
  const task = await seedTask(api, { link, ...(assigneeId && { assigneeId }) });

  return { task, project, customer };
};

export const seedLegacyCustomerTask = async (
  api: TGenAirApi,
  customer: ICustomer,
  assigneeId: string | null = null,
): Promise<ITask> => {
  const title = createUniqueName(SEED_NAME_PREFIXES.TASK);
  const id = await insertLegacyCustomerTask({
    title,
    customerId: customer.id,
    createdById: api.session.user.id,
    assigneeId,
  });
  return { id, title };
};
