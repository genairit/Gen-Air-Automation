import type { TGenAirApi } from "../../src/api/gen-air-api.ts";
import { test, expect } from "../../src/fixtures/test.fixture.ts";
import { USER_ROLES } from "../../src/constants/user-role.constant.ts";
import { TEST_USERS } from "../../src/constants/test-users.constant.ts";
import { seedCustomer, seedStandaloneProject } from "../../src/api/seed-data.ts";
import { HTTP_METHODS, HTTP_STATUS } from "../../src/constants/http.constant.ts";

const ESTIMATES = "/engineering-estimates";

const createBill = async (api: TGenAirApi, projectId: string, name: string) => {
  const response = await api.send(HTTP_METHODS.POST, ESTIMATES, { name, projectId });
  expect(response.status()).toBe(HTTP_STATUS.CREATED);
  return (await response.json()) as { id: string; version: number };
};

test("Project estimate pages filter before pagination and preserve project ownership", async ({
  api,
  apiAs,
}) => {
  const engineer = await apiAs(TEST_USERS[USER_ROLES.ENGINEER]);
  const customer = await seedCustomer(api);
  const project = await seedStandaloneProject(api, customer);
  const other = await seedStandaloneProject(api, customer);
  const oldest = await createBill(engineer, project.id, "אומדן ראשון");
  await createBill(api, project.id, "אומדן של עובד אחר");
  const newest = await createBill(engineer, project.id, "אומדן אחרון");
  await createBill(engineer, other.id, "אומדן של פרויקט אחר");
  const query = new URLSearchParams({ projectId: project.id, batchSize: "1" });
  const first = await engineer.send(HTTP_METHODS.GET, `${ESTIMATES}?${query}`);
  expect(first.status()).toBe(HTTP_STATUS.OK);
  const firstPage = await first.json();
  expect(firstPage).toMatchObject({
    items: [{ id: newest.id, projectId: project.id }],
    nextCursor: expect.any(String),
  });
  query.set("batchCursor", firstPage.nextCursor);
  const next = await engineer.send(HTTP_METHODS.GET, `${ESTIMATES}?${query}`);
  expect(next.status()).toBe(HTTP_STATUS.OK);
  expect(await next.json()).toMatchObject({
    items: [{ id: oldest.id, projectId: project.id }],
    nextCursor: null,
  });
  const detach = await engineer.send(HTTP_METHODS.PATCH, `${ESTIMATES}/${oldest.id}`, {
    version: oldest.version,
    projectId: null,
  });
  expect(detach.status()).toBe(HTTP_STATUS.CONFLICT);
  const saved = await engineer.send(HTTP_METHODS.GET, `${ESTIMATES}/${oldest.id}`);
  expect(await saved.json()).toMatchObject({
    id: oldest.id,
    projectId: project.id,
    version: oldest.version,
  });
});
