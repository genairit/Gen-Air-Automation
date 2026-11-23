import {
  seedCustomer,
  seedBuilding,
  seedApartment,
  seedStandaloneProject,
  seedLegacyCustomerTask,
} from "../../src/api/seed-data.ts";

import {
  taskQuotationQuery,
  withTaskQuotationLinkFailure,
} from "../../src/environment/task-quotation-fixtures.ts";

import { randomUUID } from "node:crypto";
import type { TGenAirApi } from "../../src/api/gen-air-api.ts";
import { test, expect } from "../../src/fixtures/test.fixture.ts";
import { TASK_TYPES } from "../../src/constants/domain.constant.ts";
import { HTTP_METHODS } from "../../src/constants/http.constant.ts";
import { QUOTATION } from "../../src/constants/quotation.constant.ts";
import { USER_ROLES } from "../../src/constants/user-role.constant.ts";
import { TEST_USERS } from "../../src/constants/test-users.constant.ts";
import { PERMISSIONS } from "../../src/constants/permission.constant.ts";
import { seedTaskQuotationScenario } from "../../src/api/task-quotation.api.ts";
import { withRolePermissions } from "../../src/environment/role-permissions.ts";
import { createCatalogueFixture } from "../../src/environment/quotation-fixtures.ts";
import { TASK_QUOTATION_UNAVAILABLE } from "../../src/constants/task-quotation.constant.ts";
import { taskQuotationPath, createTaskQuotation } from "../../src/api/task-quotation.api.ts";
import { setLegacyTaskQuotationFixture } from "../../src/environment/task-quotation-fixtures.ts";
import { quotationDocument, quotationWrite, createQuotation } from "../../src/api/quotation.api.ts";

const scenario = seedTaskQuotationScenario;
const document = async (
  api: TGenAirApi,
  id: string,
): Promise<import("../../src/interfaces/quotation.interface.ts").IQuotationDocument> =>
  quotationDocument(await api.send(HTTP_METHODS.GET, `/quotation/${id}`));
const counts = (): Promise<{ quotations: string; links: string }[]> =>
  taskQuotationQuery<{ quotations: string; links: string }>(
    "SELECT (SELECT count(*) FROM quotations)::text quotations, (SELECT count(*) FROM task_quotation_links)::text links",
  );

test("task-locked concurrent creation and retries persist one primary draft with normal snapshots and no task transition", async ({
  api,
}) => {
  const { task, customer, project } = await scenario(api);
  const ordinary = await createQuotation(api, customer.id);
  const transitions = await api.getTaskTransitions(task.id);
  const before = await api.getTask(task.id);
  const results = await Promise.all(
    Array.from({ length: 8 }, () => createTaskQuotation(api, task.id)),
  );
  expect(new Set(results.map(result => result.quotationId)).size).toBe(1);
  expect(results.filter(result => result.created)).toHaveLength(1);
  const id = results[0]!.quotationId;
  expect(await createTaskQuotation(api, task.id)).toEqual({ quotationId: id, created: false });
  const quote = await document(api, id);
  expect(quote).toMatchObject({
    customerId: customer.id,
    projectId: project.id,
    status: QUOTATION.STATUS.DRAFT,
    version: 1,
    sections: [],
  });
  for (const key of [
    "paymentTerms",
    "paymentTermsNote",
    "paymentSchedule",
    "vatRate",
    "ruleConfigFingerprint",
  ] as const)
    expect(quote[key]).toEqual(ordinary[key]);
  expect(
    await taskQuotationQuery(
      "SELECT project_id, is_primary FROM quotation_projects WHERE quotation_id=$1",
      [id],
    ),
  ).toEqual([{ project_id: project.id, is_primary: true }]);
  expect(
    await taskQuotationQuery(
      "SELECT quotation_id, is_primary FROM task_quotation_links WHERE task_id=$1",
      [task.id],
    ),
  ).toEqual([{ quotation_id: id, is_primary: true }]);
  expect(await api.getTask(task.id)).toEqual(before);
  expect(await api.getTaskTransitions(task.id)).toEqual(transitions);
});

test("exact apartment direct customer and legacy customer-only context never infer a parent or project", async ({
  api,
}) => {
  const building = await seedBuilding(api, await seedCustomer(api));
  const apartment = await seedApartment(api, building);
  const task = await api.createTask({
    projectId: apartment.id,
    taskType: TASK_TYPES.QUOTATION,
    title: "דירה",
    description: "QA",
  });
  const quote = await document(api, (await createTaskQuotation(api, task.id)).quotationId);
  const rows = await taskQuotationQuery<{ customer_id: string }>(
    "SELECT customer_id FROM projects WHERE id=$1",
    [apartment.id],
  );
  expect(quote.projectId).toBe(apartment.id);
  expect(quote.customerId).toBe(rows[0]!.customer_id);
  const customer = await seedCustomer(api);
  const legacy = await seedLegacyCustomerTask(api, customer);
  await setLegacyTaskQuotationFixture(legacy.id, customer.id);
  expect(
    await document(api, (await createTaskQuotation(api, legacy.id)).quotationId),
  ).toMatchObject({ customerId: customer.id, projectId: null });
  expect(
    (
      await api.send(HTTP_METHODS.POST, "/task", {
        customerId: customer.id,
        title: "forbidden new customer task",
        description: "QA",
        taskType: TASK_TYPES.QUOTATION,
      })
    ).status(),
  ).toBe(400);
});

test("wrong task type, missing/deleted context, inconsistent customer and forged body leave no draft or link", async ({
  api,
}) => {
  const { task, project, customer } = await scenario(api);
  const other = await seedCustomer(api);
  const before = await counts();
  expect((await api.send(HTTP_METHODS.POST, taskQuotationPath(randomUUID()), {})).status()).toBe(
    404,
  );
  expect(
    (
      await api.send(HTTP_METHODS.POST, taskQuotationPath(task.id), {
        customerId: other.id,
        projectId: randomUUID(),
      })
    ).status(),
  ).toBe(400);
  for (const taskType of [TASK_TYPES.GENERAL, TASK_TYPES.PLANNING]) {
    await taskQuotationQuery("UPDATE tasks SET task_type=$2 WHERE id=$1", [task.id, taskType]);
    expect((await api.send(HTTP_METHODS.POST, taskQuotationPath(task.id), {})).status()).toBe(400);
  }
  await setLegacyTaskQuotationFixture(task.id, other.id);
  expect((await api.send(HTTP_METHODS.POST, taskQuotationPath(task.id), {})).status()).toBe(400);
  await taskQuotationQuery("UPDATE tasks SET customer_id=NULL WHERE id=$1", [task.id]);
  await taskQuotationQuery("UPDATE projects SET customer_id=NULL WHERE id=$1", [project.id]);
  expect((await api.send(HTTP_METHODS.POST, taskQuotationPath(task.id), {})).status()).toBe(400);
  await taskQuotationQuery("UPDATE projects SET customer_id=$2, deleted_at=NOW() WHERE id=$1", [
    project.id,
    customer.id,
  ]);
  expect((await api.send(HTTP_METHODS.POST, taskQuotationPath(task.id), {})).status()).toBe(400);
  expect(await counts()).toEqual(before);
});

test("link persistence failure rolls back the draft, and retry creates exactly one complete association", async ({
  api,
}) => {
  const { task } = await scenario(api);
  const before = await counts();
  await withTaskQuotationLinkFailure(task.id, async () => {
    expect((await api.send(HTTP_METHODS.POST, taskQuotationPath(task.id), {})).status()).toBe(500);
    expect(await counts()).toEqual(before);
  });
  expect((await createTaskQuotation(api, task.id)).created).toBe(true);
});

test("linked project context is enforced on ordinary saves without modifying document or link", async ({
  api,
}) => {
  const { task } = await scenario(api);
  const quote = await document(api, (await createTaskQuotation(api, task.id)).quotationId);
  const other = await scenario(api);
  for (const update of [
    { projectId: other.project.id },
    { projectId: null },
    { customerId: other.customer.id },
  ]) {
    expect(
      (
        await api.send(HTTP_METHODS.PUT, `/quotation/${quote.id}`, {
          ...quotationWrite(quote),
          ...update,
        })
      ).status(),
    ).toBe(409);
    expect(await document(api, quote.id)).toEqual(quote);
  }
});

test("brand clones carry explicit secondary links and deleted primary repair preserves history", async ({
  api,
  apiAs,
}) => {
  const { task } = await scenario(api);
  const original = await document(api, (await createTaskQuotation(api, task.id)).quotationId);
  const sourceItem = await createCatalogueFixture();
  const targetItem = await createCatalogueFixture({ brand: QUOTATION.OTHER_BRAND });
  const source = await quotationDocument(
    await api.send(HTTP_METHODS.PUT, `/quotation/${original.id}`, {
      ...quotationWrite(original),
      brand: QUOTATION.BRAND,
      sections: [
        {
          id: randomUUID(),
          title: "Task brand",
          systemType: QUOTATION.SYSTEM.SINGLE,
          brand: QUOTATION.BRAND,
          items: [
            {
              id: randomUUID(),
              catalogueItemId: sourceItem.id,
              parentItemId: null,
              description: sourceItem.description,
              quotedPrice: sourceItem.price,
              quantity: "1",
              location: "",
              circuit: null,
              requestedCapacityBtu: null,
            },
          ],
        },
      ],
    }),
  );
  const clone = await quotationDocument(
    await api.send(HTTP_METHODS.POST, `/quotation/${source.id}/clone`, {
      sourceVersion: source.version,
      targetBrand: QUOTATION.OTHER_BRAND,
      mappings: [
        { sourceLineId: source.sections[0]!.items[0]!.id, targetCatalogueItemId: targetItem.id },
      ],
    }),
  );
  expect(
    await taskQuotationQuery(
      "SELECT quotation_id, is_primary FROM task_quotation_links WHERE task_id=$1 ORDER BY is_primary DESC",
      [task.id],
    ),
  ).toEqual([
    { quotation_id: source.id, is_primary: true },
    { quotation_id: clone.id, is_primary: false },
  ]);
  const second = await quotationDocument(
    await api.send(HTTP_METHODS.POST, `/quotation/${clone.id}/clone`, {
      sourceVersion: clone.version,
      targetBrand: QUOTATION.BRAND,
      mappings: [
        { sourceLineId: clone.sections[0]!.items[0]!.id, targetCatalogueItemId: sourceItem.id },
      ],
    }),
  );
  expect(
    await taskQuotationQuery(
      "SELECT task_id, is_primary FROM task_quotation_links WHERE quotation_id=$1",
      [second.id],
    ),
  ).toEqual([{ task_id: task.id, is_primary: false }]);
  await withRolePermissions(
    USER_ROLES.ENGINEER,
    [
      PERMISSIONS.QUOTATIONS_READ,
      PERMISSIONS.QUOTATIONS_CREATE,
      PERMISSIONS.PROJECTS_READ,
      PERMISSIONS.CUSTOMERS_READ,
    ],
    async () => {
      const actor = await apiAs(TEST_USERS[USER_ROLES.ENGINEER]);
      const response = await actor.send(HTTP_METHODS.POST, `/quotation/${second.id}/clone`, {
        sourceVersion: second.version,
        targetBrand: QUOTATION.OTHER_BRAND,
        mappings: [
          { sourceLineId: second.sections[0]!.items[0]!.id, targetCatalogueItemId: targetItem.id },
        ],
      });
      expect(response.status()).toBe(201);
      const copy = await response.json();
      expect(copy.taskLinks).toEqual([]);
      expect(
        await taskQuotationQuery(
          "SELECT task_id, is_primary FROM task_quotation_links WHERE quotation_id=$1",
          [copy.id],
        ),
      ).toEqual([{ task_id: task.id, is_primary: false }]);
      const detail = await actor.send(HTTP_METHODS.GET, `/quotation/${copy.id}`);
      expect(detail.status()).toBe(200);
      expect((await detail.json()).taskLinks).toEqual([]);
    },
  );
  const history = await api.getTaskTransitions(task.id);
  expect(
    (
      await api.send(HTTP_METHODS.DELETE, `/quotation/${source.id}`, { version: source.version })
    ).status(),
  ).toBe(204);
  const repaired = await createTaskQuotation(api, task.id);
  expect(repaired.created).toBe(false);
  expect(repaired.quotationId).toBe(clone.id);
  expect(
    await taskQuotationQuery(
      "SELECT quotation_id FROM task_quotation_links WHERE task_id=$1 AND is_primary=true",
      [task.id],
    ),
  ).toEqual([{ quotation_id: repaired.quotationId }]);
  expect(
    await taskQuotationQuery("SELECT quotation_id FROM task_quotation_links WHERE task_id=$1", [
      task.id,
    ]),
  ).toHaveLength(4);
  expect(await api.getTaskTransitions(task.id)).toEqual(history);
});

test("each required feature grant is independently enforced; creating does not require task update or status permissions", async ({
  api,
  apiAs,
}) => {
  const { task } = await scenario(api);
  const required = [
    PERMISSIONS.TASKS_READ,
    PERMISSIONS.QUOTATIONS_READ,
    PERMISSIONS.QUOTATIONS_CREATE,
    PERMISSIONS.CUSTOMERS_READ,
    PERMISSIONS.PROJECTS_READ,
  ];
  for (const missing of required) {
    await withRolePermissions(
      USER_ROLES.ENGINEER,
      required.filter(key => key !== missing),
      async () => {
        const actor = await apiAs(TEST_USERS[USER_ROLES.ENGINEER]);
        const before = await counts();
        expect(
          (await actor.send(HTTP_METHODS.POST, taskQuotationPath(task.id), {})).status(),
          missing,
        ).toBe(403);
        expect(await counts()).toEqual(before);
      },
    );
  }
  await withRolePermissions(USER_ROLES.ENGINEER, required, async () => {
    const actor = await apiAs(TEST_USERS[USER_ROLES.ENGINEER]);
    expect((await createTaskQuotation(actor, task.id)).created).toBe(true);
  });
});

test("customer-only save permits an explicitly chosen own project; deleted task leaves document readable without reverse navigation", async ({
  api,
}) => {
  const customer = await seedCustomer(api);
  const task = await seedLegacyCustomerTask(api, customer);
  await setLegacyTaskQuotationFixture(task.id, customer.id);
  const quote = await document(api, (await createTaskQuotation(api, task.id)).quotationId);
  const ownProject = await seedStandaloneProject(api, customer);
  const saved = await quotationDocument(
    await api.send(HTTP_METHODS.PUT, `/quotation/${quote.id}`, {
      ...quotationWrite(quote),
      projectId: ownProject.id,
    }),
  );
  expect(saved.projectId).toBe(ownProject.id);
  const other = await scenario(api);
  expect(
    (
      await api.send(HTTP_METHODS.PUT, `/quotation/${saved.id}`, {
        ...quotationWrite(saved),
        projectId: other.project.id,
      })
    ).status(),
  ).toBe(400);
  await setLegacyTaskQuotationFixture(task.id, customer.id, true);
  const response = await api.send(HTTP_METHODS.GET, `/quotation/${saved.id}`);
  expect(response.status()).toBe(200);
  expect((await response.json()).taskLinks).toEqual([]);
  expect((await api.send(HTTP_METHODS.POST, taskQuotationPath(task.id), {})).status()).toBe(404);
  expect((await document(api, saved.id)).status).toBe(QUOTATION.STATUS.DRAFT);
});

test("matching project quotations do not acquire a task association and deleted customer blocks new creation", async ({
  api,
}) => {
  const { customer, project, task } = await scenario(api);
  const ordinary = await createQuotation(api, customer.id);
  const saved = await quotationDocument(
    await api.send(HTTP_METHODS.PUT, `/quotation/${ordinary.id}`, {
      ...quotationWrite(ordinary),
      projectId: project.id,
    }),
  );
  const context = await api.send(HTTP_METHODS.GET, `/task/${task.id}/quotations`);
  expect(context.status()).toBe(200);
  expect((await context.json()).quotations).toEqual([]);
  expect(
    (await (await api.send(HTTP_METHODS.GET, `/quotation/${saved.id}`)).json()).taskLinks,
  ).toEqual([]);
  const before = await counts();
  await taskQuotationQuery("UPDATE customers SET deleted_at=NOW() WHERE id=$1", [customer.id]);
  expect((await api.send(HTTP_METHODS.POST, taskQuotationPath(task.id), {})).status()).toBe(400);
  expect(await counts()).toEqual(before);
});

test("apartment without a direct customer never borrows its live parent customer", async ({
  api,
}) => {
  const building = await seedBuilding(api, await seedCustomer(api));
  const apartment = await seedApartment(api, building);
  const task = await api.createTask({
    projectId: apartment.id,
    taskType: TASK_TYPES.QUOTATION,
    title: "חסר לקוח ישיר",
    description: "QA",
  });
  await taskQuotationQuery("UPDATE projects SET customer_id=NULL WHERE id=$1", [apartment.id]);
  const before = await counts();
  const context = await api.send(HTTP_METHODS.GET, `/task/${task.id}/quotations`);
  expect(context.status()).toBe(200);
  expect(await context.json()).toMatchObject({
    customerId: null,
    projectId: apartment.id,
    canCreate: false,
    unavailableReason: TASK_QUOTATION_UNAVAILABLE.MISSING_CONTEXT,
  });
  expect((await api.send(HTTP_METHODS.POST, taskQuotationPath(task.id), {})).status()).toBe(400);
  expect(await counts()).toEqual(before);
});

test("deleting the only linked quotation permits one new draft and retains both historical associations", async ({
  api,
}) => {
  const { task } = await scenario(api);
  const old = await document(api, (await createTaskQuotation(api, task.id)).quotationId);
  expect(
    (
      await api.send(HTTP_METHODS.DELETE, `/quotation/${old.id}`, { version: old.version })
    ).status(),
  ).toBe(204);
  const replacement = await createTaskQuotation(api, task.id);
  expect(replacement.created).toBe(true);
  expect(replacement.quotationId).not.toBe(old.id);
  expect(await createTaskQuotation(api, task.id)).toEqual({
    quotationId: replacement.quotationId,
    created: false,
  });
  expect(
    await taskQuotationQuery(
      "SELECT quotation_id, is_primary FROM task_quotation_links WHERE task_id=$1 ORDER BY is_primary DESC",
      [task.id],
    ),
  ).toEqual([
    { quotation_id: replacement.quotationId, is_primary: true },
    { quotation_id: old.id, is_primary: false },
  ]);
});

test("customer-only creation omits project-read dependency and protected summaries independently require their grants", async ({
  api,
  apiAs,
}) => {
  const customer = await seedCustomer(api);
  const legacy = await seedLegacyCustomerTask(api, customer);
  await setLegacyTaskQuotationFixture(legacy.id, customer.id);
  const grants = [
    PERMISSIONS.TASKS_READ,
    PERMISSIONS.CUSTOMERS_READ,
    PERMISSIONS.QUOTATIONS_READ,
    PERMISSIONS.QUOTATIONS_CREATE,
  ];
  await withRolePermissions(USER_ROLES.ENGINEER, grants, async () => {
    const actor = await apiAs(TEST_USERS[USER_ROLES.ENGINEER]);
    expect((await createTaskQuotation(actor, legacy.id)).created).toBe(true);
    expect((await actor.send(HTTP_METHODS.GET, `/task/${legacy.id}/quotations`)).status()).toBe(
      200,
    );
  });
  for (const missing of [PERMISSIONS.TASKS_READ, PERMISSIONS.QUOTATIONS_READ]) {
    await withRolePermissions(
      USER_ROLES.ENGINEER,
      grants.filter(key => key !== missing),
      async () => {
        const actor = await apiAs(TEST_USERS[USER_ROLES.ENGINEER]);
        expect(
          (await actor.send(HTTP_METHODS.GET, `/task/${legacy.id}/quotations`)).status(),
          missing,
        ).toBe(403);
      },
    );
  }
  const { task } = await scenario(api);
  const linked = await createTaskQuotation(api, task.id);
  for (const missing of [PERMISSIONS.CUSTOMERS_READ, PERMISSIONS.PROJECTS_READ]) {
    await withRolePermissions(
      USER_ROLES.ENGINEER,
      [...grants, PERMISSIONS.PROJECTS_READ].filter(key => key !== missing),
      async () => {
        const actor = await apiAs(TEST_USERS[USER_ROLES.ENGINEER]);
        const response = await actor.send(HTTP_METHODS.GET, `/task/${task.id}/quotations`);
        expect(response.status()).toBe(200);
        const context = await response.json();
        expect(context.canCreate).toBe(false);
        expect(
          context[missing === PERMISSIONS.CUSTOMERS_READ ? "customerId" : "projectId"],
        ).toBeNull();
        expect(context.quotations.map((quote: { id: string }) => quote.id)).toEqual([
          linked.quotationId,
        ]);
        expect(await createTaskQuotation(actor, task.id)).toEqual({
          quotationId: linked.quotationId,
          created: false,
        });
      },
    );
  }
});

test("a building task retains its exact primary project and direct customer", async ({ api }) => {
  const customer = await seedCustomer(api);
  const building = await seedBuilding(api, customer);
  const task = await api.createTask({
    projectId: building.id,
    taskType: TASK_TYPES.QUOTATION,
    title: "הצעת בניין",
    description: "QA",
  });
  const quote = await document(api, (await createTaskQuotation(api, task.id)).quotationId);
  expect(quote).toMatchObject({ customerId: customer.id, projectId: building.id });
  expect(
    await taskQuotationQuery(
      "SELECT project_id, is_primary FROM quotation_projects WHERE quotation_id=$1",
      [quote.id],
    ),
  ).toEqual([{ project_id: building.id, is_primary: true }]);
});
