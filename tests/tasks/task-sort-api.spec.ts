import {
  taskSortPath,
  sortTaskRows,
  readTaskSortPage,
  seedTaskSortScenario,
  traverseTaskSortPages,
} from "../../src/api/task-sort.api.ts";

import { test, expect } from "../../src/fixtures/api.fixture.ts";
import { URLS } from "../../src/constants/environment.constant.ts";
import { USER_ROLES } from "../../src/constants/user-role.constant.ts";
import { TASK_STATUSES } from "../../src/constants/domain.constant.ts";
import { PERMISSIONS } from "../../src/constants/permission.constant.ts";
import { withRolePermissions } from "../../src/environment/role-permissions.ts";
import { HTTP_METHODS, HTTP_STATUS } from "../../src/constants/http.constant.ts";
import type { ITaskSortQuery } from "../../src/interfaces/task-sort.interface.ts";
import { TASK_SORT_MODES, TASK_SORT_FIXTURE } from "../../src/constants/task-sort.constant.ts";

for (const sort of Object.values(TASK_SORT_MODES)) {
  test(
    "my tasks traverses complete " + sort + " ordering across dates, ties, overdue and nulls",
    async ({ api, apiAs }) => {
      const scenario = await seedTaskSortScenario(api);
      const actor = await apiAs(scenario.engineer);
      const rows = await traverseTaskSortPages({
        api: actor,
        query: { sort, search: scenario.prefix },
      });
      expect(rows.map(row => row.id)).toEqual(sortTaskRows(scenario.rows, sort).map(row => row.id));
      expect(new Set(rows.map(row => row.id)).size).toBe(scenario.rows.length);
      expect(rows.every(row => row.assigneeId === actor.session.user.id)).toBe(true);
    },
  );
}

test("due-date pagination preserves filters and ignores a forged personal assignee", async ({
  api,
  apiAs,
}) => {
  const scenario = await seedTaskSortScenario(api);
  const actor = await apiAs(scenario.engineer);
  const sort = TASK_SORT_MODES.LATEST;
  const filtersToVerify: ITaskSortQuery[] = [
    { status: TASK_STATUSES.IN_PROGRESS },
    { isUrgent: "true" },
    { projectId: scenario.projectId },
    { assigneeId: scenario.foreignAssigneeId },
  ];
  for (const filters of filtersToVerify) {
    const rows = await traverseTaskSortPages({
      api: actor,
      query: { search: scenario.prefix, sort, ...filters },
    });
    const expected = scenario.rows.filter(row => {
      const statusMatches = !("status" in filters) || row.status === filters.status;
      const urgencyMatches = !("isUrgent" in filters) || row.isUrgent;
      return statusMatches && urgencyMatches;
    });
    expect(rows.map(row => row.id)).toEqual(sortTaskRows(expected, sort).map(row => row.id));
  }

  const empty = await traverseTaskSortPages({
    api: actor,
    query: { search: scenario.prefix, sort, unassigned: "true" },
  });
  expect(empty).toEqual([]);
});

test("task cursor rejects malformed and mismatched modes while preserving legacy default cursors", async ({
  api,
  apiAs,
}) => {
  const scenario = await seedTaskSortScenario(api);
  const actor = await apiAs(scenario.engineer);
  const common = { search: scenario.prefix, batchSize: String(TASK_SORT_FIXTURE.PAGE_SIZE) };
  const first = await readTaskSortPage(actor, common);
  const last = first.items.at(-1);
  if (!last || !first.nextCursor) {
    throw new Error("The fixture must span pages");
  }

  const legacy = Buffer.from(
    JSON.stringify({ id: last.id, isUrgent: last.isUrgent, dueDate: last.dueDate }),
  ).toString("base64url");
  const continued = await readTaskSortPage(actor, { ...common, batchCursor: legacy });
  const expected = sortTaskRows(scenario.rows, TASK_SORT_MODES.DEFAULT).slice(
    TASK_SORT_FIXTURE.PAGE_SIZE,
    TASK_SORT_FIXTURE.PAGE_SIZE * 2,
  );
  expect(continued.items.map(row => row.id)).toEqual(expected.map(row => row.id));
  for (const query of [
    { ...common, sort: "unsupported" },
    { ...common, batchCursor: "not-json" },
    { ...common, sort: TASK_SORT_MODES.EARLIEST, batchCursor: legacy },
    { ...common, sort: TASK_SORT_MODES.LATEST, batchCursor: first.nextCursor },
    {
      ...common,
      batchCursor: Buffer.from(
        JSON.stringify({ id: last.id, isUrgent: true, dueDate: "invalid" }),
      ).toString("base64url"),
    },
  ]) {
    expect((await actor.send(HTTP_METHODS.GET, taskSortPath(query))).status()).toBe(
      HTTP_STATUS.BAD_REQUEST,
    );
  }
});

test("task sorting preserves authentication and read permission checks", async ({
  api,
  apiAs,
  playwright,
}) => {
  const scenario = await seedTaskSortScenario(api);
  const actor = await apiAs(scenario.engineer);
  const path = taskSortPath({ search: scenario.prefix, sort: TASK_SORT_MODES.EARLIEST });
  const anonymous = await playwright.request.newContext({ baseURL: URLS.BACKEND });
  try {
    expect((await anonymous.get(path)).status()).toBe(HTTP_STATUS.UNAUTHORIZED);
  } finally {
    await anonymous.dispose();
  }
  const retained = actor.session.user.permissions.filter(
    permission => permission !== PERMISSIONS.TASKS_READ,
  );
  await withRolePermissions(USER_ROLES.ENGINEER, retained, async () => {
    expect((await actor.send(HTTP_METHODS.GET, path)).status()).toBe(HTTP_STATUS.FORBIDDEN);
  });
});
