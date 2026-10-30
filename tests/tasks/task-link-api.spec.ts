import {
  seedCustomer,
  seedBuilding,
  seedApartment,
  buildCustomerInput,
  seedStandaloneProject,
  OWNED_PROJECT_SEEDERS,
  seedLegacyCustomerTask,
  seedLegacyTaskScenario,
  buildUnlinkedTaskInput,
} from "../../src/api/seed-data.ts";

import { test, expect } from "../../src/fixtures/api.fixture.ts";
import { USER_ROLES } from "../../src/constants/user-role.constant.ts";
import { buildTaskPath } from "../../src/utilities/api-path.utility.ts";
import { TEST_USERS } from "../../src/constants/test-users.constant.ts";
import { HTTP_METHODS, HTTP_STATUS } from "../../src/constants/http.constant.ts";
import { buildImportRow } from "../../src/utilities/apartment-import.utility.ts";
import { TASK_TYPES, TASK_STATUSES } from "../../src/constants/domain.constant.ts";
import { uploadApartments, readBuildingApartments } from "../../src/api/apartment-import.api.ts";

const expectPair = async (
  api: Parameters<typeof seedCustomer>[0],
  project: { id: string; name: string },
) => {
  expect((await api.getProject(project.id)).stage.name).toBe("טיוטה");
  const tasks = (await api.getProjectTasks(project.id)).items;
  expect(tasks).toHaveLength(2);
  expect(tasks.map(task => task.taskType).sort()).toEqual([
    TASK_TYPES.PLANNING,
    TASK_TYPES.QUOTATION,
  ]);
  for (const task of tasks) {
    const label = task.taskType === TASK_TYPES.QUOTATION ? "הצעת מחיר" : "תכנון";
    expect(task).toMatchObject({
      title: `${label} — ${project.name}`,
      status: TASK_STATUSES.NOT_STARTED,
      assigneeId: null,
      dueDate: null,
      customerId: null,
    });
    expect(task.isUrgent).toBe(false);
    expect(task.description).toBe(
      task.taskType === TASK_TYPES.QUOTATION
        ? `הכנת הצעת מחיר עבור הפרויקט ${project.name}: ריכוז דרישות הלקוח והפריטים הנדרשים, קביעת כמויות ומחירים ובדיקת תנאי התשלום, לצורך הכנת הצעה מסודרת ללקוח.`
        : `הכנת תכנון עבור הפרויקט ${project.name}: בחינת דרישות הפרויקט והתוכניות הזמינות, גיבוש פתרון המיזוג ותיאום הפרטים הנדרשים להכנת תוכנית לביצוע.`,
    );
    const history = await api.getTaskTransitions(task.id);
    expect(history).toEqual([
      expect.objectContaining({ fromStatus: null, toStatus: TASK_STATUSES.NOT_STARTED }),
    ]);
  }
  return tasks;
};

test("normal projects and manually created apartments start Draft with the exact mandatory pair and histories", async ({
  api,
}) => {
  const customer = await seedCustomer(api);
  await expectPair(api, await seedStandaloneProject(api, customer));
  const building = await seedBuilding(api, customer);
  await expectPair(api, building);
  await expectPair(api, await seedApartment(api, building));
});

test("Excel apartments initialize the pair exactly once and duplicate import retains IDs", async ({
  api,
}) => {
  const building = await seedBuilding(api, await seedCustomer(api));
  const row = buildImportRow(buildCustomerInput());
  expect((await uploadApartments(api, building.id, [row])).counts.created).toBe(1);
  const apartments = await readBuildingApartments(api, building.id);
  const apartment = apartments[0];
  const project = await api.getProject(apartment.id);
  const tasks = await expectPair(api, project);
  expect((await uploadApartments(api, building.id, [row])).counts.existing).toBe(1);
  expect(await api.getProjectTasks(apartment.id).then(page => page.items)).toEqual(tasks);
});

test("manual creation requires a valid project, rejects customer links/protected or unknown types and invalid supplied dates", async ({
  api,
}) => {
  const customer = await seedCustomer(api);
  const project = await seedStandaloneProject(api, customer);
  const input = { ...buildUnlinkedTaskInput(), projectId: project.id };
  for (const overrides of [
    { projectId: null },
    { projectId: "bad" },
    { customerId: customer.id },
    { taskType: TASK_TYPES.QUOTATION },
    { taskType: TASK_TYPES.PLANNING },
    { taskType: "unknown" },
    { dueDate: "2020-01-01" },
  ]) {
    expect((await api.send(HTTP_METHODS.POST, "/task", { ...input, ...overrides })).status()).toBe(
      HTTP_STATUS.BAD_REQUEST,
    );
  }
  expect(
    (
      await api.send(HTTP_METHODS.POST, "/task", {
        ...input,
        projectId: "00000000-0000-4000-8000-000000000000",
      })
    ).status(),
  ).toBe(HTTP_STATUS.NOT_FOUND);
  expect(
    (
      await api.send(HTTP_METHODS.POST, "/task", {
        ...buildUnlinkedTaskInput(),
        customerId: customer.id,
      })
    ).status(),
  ).toBe(HTTP_STATUS.BAD_REQUEST);
  expect(await api.getProjectTasks(project.id).then(page => page.items)).toHaveLength(2);
});

test("protected tasks cannot be deleted, converted, relinked or duplicated; completion/resume retains IDs/history", async ({
  api,
}) => {
  const project = await seedStandaloneProject(api, await seedCustomer(api));
  const other = await seedStandaloneProject(api, await seedCustomer(api));
  const tasks = await expectPair(api, project);
  for (const task of tasks) {
    expect((await api.send(HTTP_METHODS.DELETE, buildTaskPath(task.id))).status()).toBe(
      HTTP_STATUS.CONFLICT,
    );
    expect(
      (
        await api.send(HTTP_METHODS.PATCH, buildTaskPath(task.id), { taskType: TASK_TYPES.GENERAL })
      ).status(),
    ).toBe(HTTP_STATUS.BAD_REQUEST);
    expect(
      (
        await api.send(HTTP_METHODS.PATCH, buildTaskPath(task.id), { projectId: other.id })
      ).status(),
    ).toBe(HTTP_STATUS.CONFLICT);
    expect(
      (
        await api.send(HTTP_METHODS.PATCH, buildTaskPath(task.id), { taskType: task.taskType })
      ).status(),
    ).toBe(HTTP_STATUS.OK);
    for (const status of [TASK_STATUSES.PROPOSAL_SENT, TASK_STATUSES.IN_PROGRESS]) {
      expect(
        (
          await api.send(HTTP_METHODS.PATCH, `${buildTaskPath(task.id)}/status`, { status })
        ).status(),
      ).toBe(HTTP_STATUS.OK);
    }
    const history = await api.getTaskTransitions(task.id);
    expect(history).toHaveLength(3);
    expect(
      (
        await api.send(HTTP_METHODS.POST, "/task", {
          ...buildUnlinkedTaskInput(),
          projectId: project.id,
          taskType: task.taskType,
        })
      ).status(),
    ).toBe(HTTP_STATUS.BAD_REQUEST);
    expect(await api.getTask(task.id)).toMatchObject({ id: task.id, projectId: project.id });
  }
  expect(await api.getProjectTasks(project.id).then(page => page.items)).toHaveLength(2);
});

test("General duplicates/delete/relink remain allowed; optional dates clear and assignment invents no date", async ({
  api,
  apiAs,
}) => {
  const customer = await seedCustomer(api);
  const project = await seedStandaloneProject(api, customer);
  const other = await seedStandaloneProject(api, customer);
  const input = {
    title: "משימה כללית",
    description: "תיאום",
    projectId: project.id,
    taskType: TASK_TYPES.GENERAL,
  };
  const first = await api.createTask(input);
  const second = await api.createTask(input);
  expect(first.id).not.toBe(second.id);
  const engineer = await apiAs(TEST_USERS[USER_ROLES.ENGINEER]);
  expect(
    (
      await api.send(HTTP_METHODS.PATCH, buildTaskPath(first.id), {
        assigneeId: engineer.session.user.id,
        projectId: other.id,
      })
    ).status(),
  ).toBe(HTTP_STATUS.OK);
  expect(await api.getTask(first.id)).toMatchObject({ dueDate: null, projectId: other.id });
  expect(
    (
      await api.send(HTTP_METHODS.PATCH, buildTaskPath(first.id), { dueDate: "2030-01-01" })
    ).status(),
  ).toBe(HTTP_STATUS.OK);
  expect(
    (await api.send(HTTP_METHODS.PATCH, buildTaskPath(first.id), { dueDate: null })).status(),
  ).toBe(HTTP_STATUS.OK);
  expect((await api.getTask(first.id)).dueDate).toBeNull();
  expect(
    (
      await api.send(HTTP_METHODS.PATCH, buildTaskPath(first.id), { taskType: TASK_TYPES.PLANNING })
    ).status(),
  ).toBe(HTTP_STATUS.BAD_REQUEST);
  expect((await api.send(HTTP_METHODS.DELETE, buildTaskPath(second.id))).status()).toBe(
    HTTP_STATUS.NO_CONTENT,
  );
});

for (const [kind, seedProject] of Object.entries(OWNED_PROJECT_SEEDERS)) {
  test(`legacy dual-link ${kind} retains metadata on update and resolves project customer`, async ({
    api,
  }) => {
    const { task, project, storedCustomer, projectCustomer } = await seedLegacyTaskScenario(
      api,
      seedProject,
    );
    expect(
      (
        await api.send(HTTP_METHODS.PATCH, buildTaskPath(task.id), { description: "תיאור מעודכן" })
      ).status(),
    ).toBe(HTTP_STATUS.OK);
    expect(await api.getTask(task.id)).toMatchObject({
      projectId: project.id,
      customerId: storedCustomer.id,
      description: "תיאור מעודכן",
    });
    const resolvedIds = await api.findTaskIds({ customerId: projectCustomer.id });
    const searchIds = await api.findTaskIds({ search: projectCustomer.name });
    expect(resolvedIds).toContain(task.id);
    expect(searchIds.sort()).toEqual([...resolvedIds].sort());
    expect(await api.countTasks({ customerId: projectCustomer.id })).toBe(resolvedIds.length);
    expect(await api.findTaskIds({ customerId: storedCustomer.id })).toEqual([]);
    expect(await api.countTasks({ customerId: storedCustomer.id })).toBe(0);
  });
}

test("legacy customer-only tasks stay usable General records without relinking", async ({
  api,
}) => {
  const customer = await seedCustomer(api);
  const task = await seedLegacyCustomerTask(api, customer);
  expect(
    (
      await api.send(HTTP_METHODS.PATCH, buildTaskPath(task.id), { description: "תיעוד ישן" })
    ).status(),
  ).toBe(HTTP_STATUS.OK);
  expect(await api.getTask(task.id)).toMatchObject({
    projectId: null,
    customerId: customer.id,
    description: "תיעוד ישן",
  });
  expect(await api.findTaskIds({ customerId: customer.id })).toEqual([task.id]);
  expect(await api.findTaskIds({ search: customer.name })).toEqual([task.id]);
  expect(await api.countTasks({ customerId: customer.id })).toBe(1);
});

test("engineer cannot manually create tasks and claiming protected task preserves null date", async ({
  api,
  apiAs,
}) => {
  const project = await seedStandaloneProject(api, await seedCustomer(api));
  const engineer = await apiAs(TEST_USERS[USER_ROLES.ENGINEER]);
  expect(
    (
      await engineer.send(HTTP_METHODS.POST, "/task", {
        ...buildUnlinkedTaskInput(),
        projectId: project.id,
      })
    ).status(),
  ).toBe(HTTP_STATUS.FORBIDDEN);
  const tasks = await api.getProjectTasks(project.id).then(page => page.items);
  expect(
    (await engineer.send(HTTP_METHODS.PATCH, `${buildTaskPath(tasks[0].id)}/claim`)).status(),
  ).toBe(HTTP_STATUS.OK);
  expect((await api.getTask(tasks[0].id)).dueDate).toBeNull();
});
