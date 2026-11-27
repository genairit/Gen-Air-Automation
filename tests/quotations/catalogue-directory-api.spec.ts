import { randomUUID } from "node:crypto";
import type { TGenAirApi } from "../../src/api/gen-air-api.ts";
import { test, expect } from "../../src/fixtures/api.fixture.ts";
import { QUOTATION } from "../../src/constants/quotation.constant.ts";
import { USER_ROLES } from "../../src/constants/user-role.constant.ts";
import { TEST_USERS } from "../../src/constants/test-users.constant.ts";
import { HTTP_METHODS, HTTP_STATUS } from "../../src/constants/http.constant.ts";
import { createCatalogueFixture } from "../../src/environment/quotation-fixtures.ts";

const CATALOGUE = "/catalogue-item";
const DIRECTORY = `${CATALOGUE}/directory`;
const MAINTENANCE = `${CATALOGUE}/maintenance`;
const engineer = TEST_USERS[USER_ROLES.ENGINEER];

interface ICataloguePage {
  nextCursor: string | null;
  items: Array<{ id: string; sku: string }>;
}

const readList = async (
  api: TGenAirApi,
  path: string,
  filters: Record<string, string>,
): Promise<ICataloguePage> => {
  const response = await api.send(HTTP_METHODS.GET, `${path}?${new URLSearchParams(filters)}`);
  expect(response.status()).toBe(HTTP_STATUS.OK);
  return response.json();
};

test("catalogue creation validates input and enforces active SKU uniqueness and management grants", async ({
  api,
  apiAs,
}) => {
  const input = {
    sku: `QA-${randomUUID()}`,
    unit: "יחידה",
    price: "12.5000",
    description: "יחידה לבדיקת הקטלוג",
    capacityBtu: 37000,
    brand: QUOTATION.BRAND,
    systemType: QUOTATION.SYSTEM.SINGLE,
  };
  const reader = await apiAs(engineer);
  const refused = await reader.send(HTTP_METHODS.POST, CATALOGUE, input);
  expect(refused.status()).toBe(HTTP_STATUS.FORBIDDEN);
  const invalid = await api.send(HTTP_METHODS.POST, CATALOGUE, { ...input, price: "-1" });
  expect(invalid.status()).toBe(HTTP_STATUS.BAD_REQUEST);

  const requests = await Promise.all([
    api.send(HTTP_METHODS.POST, CATALOGUE, input),
    api.send(HTTP_METHODS.POST, CATALOGUE, { ...input, sku: ` ${input.sku} ` }),
  ]);
  expect(requests.map(result => result.status()).sort()).toEqual([
    HTTP_STATUS.CREATED,
    HTTP_STATUS.CONFLICT,
  ]);
  const created: ICataloguePage["items"][number] = await requests
    .find(result => result.status() === HTTP_STATUS.CREATED)!
    .json();
  expect(created).toMatchObject({ ...input, status: QUOTATION.CATALOGUE.ACTIVE });

  const path = `${CATALOGUE}/${created.id}`;
  expect((await reader.send(HTTP_METHODS.PATCH, path, { price: "22" })).status()).toBe(
    HTTP_STATUS.FORBIDDEN,
  );
  expect((await reader.send(HTTP_METHODS.GET, MAINTENANCE)).status()).toBe(HTTP_STATUS.FORBIDDEN);
  expect((await readList(reader, DIRECTORY, { search: input.sku })).items).toEqual([
    expect.objectContaining({ id: created.id }),
  ]);
  expect((await api.send(HTTP_METHODS.PATCH, path, { sku: "changed" })).status()).toBe(
    HTTP_STATUS.BAD_REQUEST,
  );

  const changes = { description: "תיאור מעודכן", price: "22.0000", capacityBtu: null };
  const updated = await api.send(HTTP_METHODS.PATCH, path, changes);
  expect(updated.status()).toBe(HTTP_STATUS.OK);
  expect(await updated.json()).toMatchObject({ ...changes, id: created.id, sku: input.sku });

  const archived = await api.send(HTTP_METHODS.PATCH, path, {
    status: QUOTATION.CATALOGUE.ARCHIVED,
  });
  expect(archived.status()).toBe(HTTP_STATUS.OK);
  const history = await api.send(HTTP_METHODS.GET, path);
  expect(history.status()).toBe(HTTP_STATUS.OK);
  expect(await history.json()).toMatchObject({
    ...changes,
    id: created.id,
    status: QUOTATION.CATALOGUE.ARCHIVED,
  });
  expect((await readList(reader, DIRECTORY, { search: input.sku })).items).toEqual([]);
  const picker = await api.send(HTTP_METHODS.GET, `${CATALOGUE}?search=${input.sku}`);
  expect(picker.status()).toBe(HTTP_STATUS.OK);
  expect(await picker.json()).toEqual([]);
});

test("catalogue search filters SKU, description, BTU, price and activity before applying its cursor", async ({
  api,
  apiAs,
}) => {
  const prefix = `Directory QA ${randomUUID()}`;
  const priced = await createCatalogueFixture({
    description: `${prefix} priced`,
    capacityBtu: 94321543,
    price: "58.1250",
  });
  const unpriced = await createCatalogueFixture({
    description: `${prefix} unpriced`,
    price: "0",
  });
  const archived = await createCatalogueFixture({
    description: `${prefix} archived`,
    status: QUOTATION.CATALOGUE.ARCHIVED,
  });
  const reader = await apiAs(engineer);

  const first = await readList(reader, DIRECTORY, { search: prefix, batchSize: "1" });
  expect(first.items).toHaveLength(1);
  expect(first.nextCursor).toEqual(expect.any(String));
  const second = await readList(reader, DIRECTORY, {
    search: prefix,
    batchSize: "1",
    batchCursor: first.nextCursor!,
  });
  expect(second.items).toHaveLength(1);
  expect(second.nextCursor).toBeNull();
  expect([...first.items, ...second.items].map(item => item.id).sort()).toEqual(
    [priced.id, unpriced.id].sort(),
  );

  const filtered = await readList(reader, DIRECTORY, {
    search: `  ${prefix.toUpperCase()}  `,
    pricedOnly: "true",
    batchSize: "1",
  });
  expect(filtered.items).toEqual([expect.objectContaining({ id: priced.id })]);
  expect(filtered.nextCursor).toBeNull();
  expect((await readList(reader, DIRECTORY, { search: priced.sku })).items).toEqual([
    expect.objectContaining({ id: priced.id }),
  ]);
  expect((await readList(reader, DIRECTORY, { search: "94,321,543" })).items).toContainEqual(
    expect.objectContaining({ id: priced.id }),
  );
  expect((await readList(api, MAINTENANCE, { search: prefix })).items).toContainEqual(
    expect.objectContaining({ id: archived.id }),
  );
  const activeMaintenance = await readList(api, MAINTENANCE, {
    search: prefix,
    excludeArchived: "true",
  });
  expect(activeMaintenance.items.map(item => item.id).sort()).toEqual(
    [priced.id, unpriced.id].sort(),
  );
});
