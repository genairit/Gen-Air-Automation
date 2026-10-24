import {
  seedTask,
  seedBuilding,
  seedCustomer,
  seedApartment,
  linkToProject,
  linkToCustomer,
  seedStandaloneProject,
  OWNED_PROJECT_SEEDERS,
  seedLegacyTaskScenario,
  buildUnlinkedTaskInput,
} from "../../src/api/seed-data.ts";

import {
  expectNotFound,
  expectResponseOk,
  expectBadRequest,
} from "../../src/utilities/response-assertion.utility.ts";

import type { APIResponse } from "@playwright/test";
import { API_PATHS } from "../../src/constants/api.constant.ts";
import { test, expect } from "../../src/fixtures/test.fixture.ts";
import { HTTP_METHODS } from "../../src/constants/http.constant.ts";
import { buildTaskPath } from "../../src/utilities/api-path.utility.ts";
import { createUniqueName } from "../../src/utilities/test-data.utility.ts";

const LINK_REQUIRED_MESSAGE = "A task must be linked to exactly one of a project or a customer";

const MISSING_ENTITY_ID = "00000000-0000-4000-8000-000000000000";

const MALFORMED_ENTITY_ID = "not-a-uuid";

const RENAMED_TASK_PREFIX = "משימה ששמה שונה";

const expectLinkRejected = async (response: APIResponse) => {
  await expectBadRequest(response);
  expect(await response.text()).toContain(LINK_REQUIRED_MESSAGE);
};

const sortIds = (ids: string[]) => [...ids].sort();

test("creating a task requires exactly one existing project or customer", async ({ api }) => {
  const customer = await seedCustomer(api);
  const project = await seedStandaloneProject(api, customer);
  const createTask = (link: object) =>
    api.send(HTTP_METHODS.POST, API_PATHS.TASK, { ...buildUnlinkedTaskInput(), ...link });

  await expectLinkRejected(await createTask({ projectId: project.id, customerId: customer.id }));
  await expectLinkRejected(await createTask({}));
  await expectLinkRejected(await createTask({ projectId: null, customerId: null }));
  await expectNotFound(await createTask({ projectId: MISSING_ENTITY_ID }));
  await expectNotFound(await createTask({ customerId: MISSING_ENTITY_ID }));
  await expectBadRequest(await createTask({ projectId: MALFORMED_ENTITY_ID }));
  await expectBadRequest(await createTask({ customerId: MALFORMED_ENTITY_ID }));
});

test("a customer task stores only its customer and a project task only its project", async ({
  api,
}) => {
  const customer = await seedCustomer(api);
  const project = await seedStandaloneProject(api, customer);
  const customerTask = await seedTask(api, { link: linkToCustomer(customer) });
  const projectTask = await seedTask(api, { link: linkToProject(project) });

  const storedCustomerTask = await api.getTask(customerTask.id);
  const storedProjectTask = await api.getTask(projectTask.id);

  expect(storedCustomerTask).toMatchObject({
    projectId: null,
    customerId: customer.id,
    customer: { id: customer.id, name: customer.name },
  });
  expect(storedProjectTask).toMatchObject({
    customerId: null,
    projectId: project.id,
    project: { id: project.id, customer: { id: customer.id, name: customer.name } },
  });
});

test("an apartment task reads its customer through the building", async ({ api }) => {
  const customer = await seedCustomer(api);
  const building = await seedBuilding(api, customer);
  const apartment = await seedApartment(api, building);
  const task = await seedTask(api, { link: linkToProject(apartment) });

  expect(await api.getTask(task.id)).toMatchObject({
    customerId: null,
    projectId: apartment.id,
    project: {
      id: apartment.id,
      parentProject: { id: building.id, customer: { id: customer.id, name: customer.name } },
    },
  });
});

test("editing a task link replaces it, clears the other side and keeps it when omitted", async ({
  api,
}) => {
  const customer = await seedCustomer(api);
  const project = await seedStandaloneProject(api, customer);
  const task = await seedTask(api, { link: linkToProject(project) });
  const editTask = (changes: object) =>
    api.send(HTTP_METHODS.PATCH, buildTaskPath(task.id), changes);

  await expectResponseOk(await editTask(linkToCustomer(customer)));
  expect(await api.getTask(task.id)).toMatchObject({ projectId: null, customerId: customer.id });

  await expectResponseOk(await editTask(linkToProject(project)));
  expect(await api.getTask(task.id)).toMatchObject({ customerId: null, projectId: project.id });

  await expectLinkRejected(await editTask({ projectId: project.id, customerId: customer.id }));
  await expectLinkRejected(await editTask({ projectId: null }));
  await expectLinkRejected(await editTask({ customerId: null }));
  await expectNotFound(await editTask({ customerId: MISSING_ENTITY_ID }));
  await expectNotFound(await editTask({ projectId: MISSING_ENTITY_ID }));
  await expectBadRequest(await editTask({ projectId: MALFORMED_ENTITY_ID }));

  const title = createUniqueName(RENAMED_TASK_PREFIX);

  await expectResponseOk(await editTask({ title }));
  expect(await api.getTask(task.id)).toMatchObject({
    title,
    customerId: null,
    projectId: project.id,
  });
});

for (const [projectKind, seedProject] of Object.entries(OWNED_PROJECT_SEEDERS)) {
  test(`a legacy ${projectKind} task keeps both links and is found by its project's customer`, async ({
    api,
  }) => {
    const { task, project, storedCustomer, projectCustomer } = await seedLegacyTaskScenario(
      api,
      seedProject,
    );
    const title = createUniqueName(RENAMED_TASK_PREFIX);

    await expectResponseOk(await api.send(HTTP_METHODS.PATCH, buildTaskPath(task.id), { title }));
    expect(await api.getTask(task.id)).toMatchObject({
      title,
      projectId: project.id,
      customerId: storedCustomer.id,
    });

    expect(await api.findTaskIds({ customerId: projectCustomer.id })).toEqual([task.id]);
    expect(await api.countTasks({ customerId: projectCustomer.id })).toBe(1);
    expect(await api.findTaskIds({ customerId: storedCustomer.id })).toEqual([]);
    expect(await api.countTasks({ customerId: storedCustomer.id })).toBe(0);
  });
}

test("the customer filter, search and counts find project and apartment tasks", async ({ api }) => {
  const customer = await seedCustomer(api);
  const otherCustomer = await seedCustomer(api);
  const project = await seedStandaloneProject(api, customer);
  const building = await seedBuilding(api, customer);
  const apartment = await seedApartment(api, building);
  const customerTask = await seedTask(api, { link: linkToCustomer(customer) });
  const projectTask = await seedTask(api, { link: linkToProject(project) });
  const apartmentTask = await seedTask(api, { link: linkToProject(apartment) });
  const linkedTaskIds = sortIds([customerTask.id, projectTask.id, apartmentTask.id]);

  await seedTask(api, { link: linkToCustomer(otherCustomer) });

  expect(sortIds(await api.findTaskIds({ customerId: customer.id }))).toEqual(linkedTaskIds);
  expect(sortIds(await api.findTaskIds({ search: customer.name }))).toEqual(linkedTaskIds);
  expect(await api.countTasks({ customerId: customer.id })).toBe(linkedTaskIds.length);
});
