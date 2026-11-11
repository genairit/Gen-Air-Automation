import { randomUUID } from "node:crypto";
import type { TGenAirApi } from "../../src/api/gen-air-api.ts";
import { isRecord } from "../../src/utilities/guard.utility.ts";
import { test, expect } from "../../src/fixtures/api.fixture.ts";
import { HTTP_METHODS } from "../../src/constants/http.constant.ts";
import { USER_ROLES } from "../../src/constants/user-role.constant.ts";
import { TEST_USERS } from "../../src/constants/test-users.constant.ts";
import { createCatalogueFixture } from "../../src/environment/quotation-fixtures.ts";
import { createTestDatabaseClient } from "../../src/environment/test-database-client.ts";

const MATERIALS_PATH = "/material";
const PREVIEW_PATH = "/catalogue-item/materials/preview";
const MATERIAL_UNIT = { UNIT: "unit", METRE: "m" } as const;
const MATERIAL_STATUS = {
  ACTIVE: "active",
  NEEDS_SPEC: "needs_spec",
  INACTIVE: "inactive",
} as const;
const MATERIAL_BASIS = {
  FIXED: "fixed",
  INCLUDED: "included",
  CONDITIONAL: "conditional",
  PROJECT_MEASUREMENT: "project_measurement",
} as const;

type MaterialUnitType = (typeof MATERIAL_UNIT)[keyof typeof MATERIAL_UNIT];
type MaterialStatusType = (typeof MATERIAL_STATUS)[keyof typeof MATERIAL_STATUS];

const uniqueCode = () => `QA-${randomUUID().toUpperCase()}`;
const breakdownPath = (itemId: string) => `/catalogue-item/${itemId}/materials`;
const revisionPath = (itemId: string, revision: number) =>
  `${breakdownPath(itemId)}/revisions/${revision}`;

const readRecord = async (response: { json: () => Promise<unknown> }) => {
  const body = await response.json();
  if (!isRecord(body)) {
    throw new Error("Expected an object response");
  }
  return body;
};

const readId = async (response: { json: () => Promise<unknown> }) => {
  const body = await readRecord(response);
  if (typeof body.id !== "string") {
    throw new Error("Expected an ID");
  }
  return body.id;
};

const createMaterial = async (
  api: TGenAirApi,
  values: {
    code?: string;
    name?: string;
    specification?: string;
    unit?: MaterialUnitType;
    status?: MaterialStatusType;
  } = {},
) => {
  const response = await api.send(HTTP_METHODS.POST, MATERIALS_PATH, {
    code: values.code ?? uniqueCode(),
    name: values.name ?? "חומר בדיקת QA",
    category: "בדיקות",
    specification: values.specification ?? "דגם בדיקה",
    unit: values.unit ?? MATERIAL_UNIT.UNIT,
    status: values.status ?? MATERIAL_STATUS.ACTIVE,
  });
  expect(response.status()).toBe(201);
  return readId(response);
};

const fixedLine = (materialId: string, quantityPerItem: string, displayOrder = 0) => ({
  materialId,
  basis: MATERIAL_BASIS.FIXED,
  quantityPerItem,
  displayOrder,
});

test("workbook material seeds retain distinct specifications and guarded catalogue mappings", async ({
  api,
}) => {
  const copper = await api.send(HTTP_METHODS.GET, `${MATERIALS_PATH}?search=COPPER-1-4`);
  expect(copper.status()).toBe(200);
  expect(await copper.json()).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        code: "COPPER-1-4",
        unit: MATERIAL_UNIT.METRE,
        status: MATERIAL_STATUS.NEEDS_SPEC,
      }),
    ]),
  );
  const otherDiameter = await api.send(HTTP_METHODS.GET, `${MATERIALS_PATH}?search=COPPER-3-8`);
  expect(await otherDiameter.json()).toEqual(
    expect.arrayContaining([expect.objectContaining({ code: "COPPER-3-8" })]),
  );
  const database = createTestDatabaseClient();
  await database.connect();
  try {
    const catalogue = await database.query<{ id: string }>(
      "SELECT id FROM catalogue_items WHERE sku='ARUM220LTE5' AND brand='LG' AND status='active' LIMIT 1",
    );
    expect(catalogue.rows).toHaveLength(1);
    const current = await api.send(HTTP_METHODS.GET, breakdownPath(catalogue.rows[0].id));
    expect(current.status()).toBe(200);
    expect(await current.json()).toMatchObject({
      revision: 1,
      lines: [
        { code: "EQ-LG-ARUM220LTE5", basis: MATERIAL_BASIS.FIXED, quantityPerItem: "1.0000" },
        { code: "MOUNT-OUTDOOR-SET", basis: MATERIAL_BASIS.CONDITIONAL },
      ],
    });
    const noGuessedPipeLengths = await database.query<{ count: string }>(
      "SELECT count(*) FROM catalogue_item_materials link JOIN materials material ON material.id=link.material_id WHERE material.code LIKE 'COPPER-%' OR material.code LIKE 'INSULATION-%'",
    );
    expect(noGuessedPipeLengths.rows[0].count).toBe("0");
  } finally {
    await database.end();
  }
});

test("material directory searches and updates while preserving shared identity", async ({
  api,
}) => {
  const code = uniqueCode();
  const id = await createMaterial(api, { code, specification: "קוטר 1/4" });
  const duplicate = await api.send(HTTP_METHODS.POST, MATERIALS_PATH, {
    code,
    name: "כפול",
    category: "בדיקות",
    unit: MATERIAL_UNIT.METRE,
    status: MATERIAL_STATUS.ACTIVE,
  });
  expect(duplicate.status()).toBe(409);
  const search = await api.send(
    HTTP_METHODS.GET,
    `${MATERIALS_PATH}?category=${encodeURIComponent("בדיקות")}&search=${encodeURIComponent("קוטר 1/4")}&status=active`,
  );
  expect(await search.json()).toEqual(
    expect.arrayContaining([expect.objectContaining({ id, code, specification: "קוטר 1/4" })]),
  );
  const updated = await api.send(HTTP_METHODS.PATCH, `${MATERIALS_PATH}/${id}`, {
    specification: "קוטר 3/8",
    status: MATERIAL_STATUS.NEEDS_SPEC,
  });
  expect(updated.status()).toBe(200);
  expect(await updated.json()).toMatchObject({ id, code, specification: "קוטר 3/8" });
  const oldFilter = await api.send(
    HTTP_METHODS.GET,
    `${MATERIALS_PATH}?search=${encodeURIComponent("קוטר 1/4")}&status=active`,
  );
  expect(await oldFilter.json()).not.toEqual(
    expect.arrayContaining([expect.objectContaining({ id })]),
  );
  const missing = await api.send(HTTP_METHODS.GET, `${MATERIALS_PATH}/${randomUUID()}`);
  expect(missing.status()).toBe(404);
});

test("shared material aggregates exact decimals and edits create immutable revisions", async ({
  api,
}) => {
  const materialId = await createMaterial(api, {
    specification: "קוטר 1/2",
    unit: MATERIAL_UNIT.METRE,
  });
  const first = await createCatalogueFixture();
  const second = await createCatalogueFixture();
  for (const [itemId, perItem] of [
    [first.id, "1.2500"],
    [second.id, "0.5000"],
  ]) {
    const saved = await api.send(HTTP_METHODS.PUT, breakdownPath(itemId), {
      expectedRevision: 0,
      lines: [fixedLine(materialId, perItem)],
    });
    expect(saved.status()).toBe(200);
    expect(await saved.json()).toMatchObject({ revision: 1, lines: [{ materialId }] });
  }
  const preview = await api.send(HTTP_METHODS.POST, PREVIEW_PATH, {
    items: [
      { catalogueItemId: first.id, quantity: "2.5" },
      { catalogueItemId: second.id, quantity: "3" },
    ],
  });
  expect(preview.status()).toBe(201);
  expect(await preview.json()).toMatchObject({
    required: [
      {
        material: { id: materialId, specification: "קוטר 1/2" },
        quantity: "4.62500000",
        contributions: expect.arrayContaining([
          { catalogueItemId: first.id, quantity: "3.12500000" },
          { catalogueItemId: second.id, quantity: "1.50000000" },
        ]),
      },
    ],
    unresolved: [],
    included: [],
  });
  const revisionOne = await readRecord(await api.send(HTTP_METHODS.GET, revisionPath(first.id, 1)));
  expect(revisionOne).toMatchObject({ revision: 1, lines: [{ specification: "קוטר 1/2" }] });
  const changed = await api.send(HTTP_METHODS.PATCH, `${MATERIALS_PATH}/${materialId}`, {
    specification: "קוטר 5/8",
  });
  expect(changed.status()).toBe(200);
  const current = await api.send(HTTP_METHODS.GET, breakdownPath(first.id));
  expect(await current.json()).toMatchObject({
    revision: 2,
    lines: [{ materialId, specification: "קוטר 5/8" }],
  });
  const historical = await api.send(HTTP_METHODS.GET, revisionPath(first.id, 1));
  expect(await historical.json()).toMatchObject(revisionOne);
  const stale = await api.send(HTTP_METHODS.PUT, breakdownPath(first.id), {
    expectedRevision: 1,
    lines: [],
  });
  expect(stale.status()).toBe(409);
  const deactivated = await api.send(HTTP_METHODS.PATCH, `${MATERIALS_PATH}/${materialId}`, {
    status: MATERIAL_STATUS.INACTIVE,
  });
  expect(deactivated.status()).toBe(200);
  expect(await (await api.send(HTTP_METHODS.GET, breakdownPath(first.id))).json()).toMatchObject({
    revision: 3,
    lines: [{ materialId, status: MATERIAL_STATUS.INACTIVE }],
  });
  const afterDeactivation = await api.send(HTTP_METHODS.POST, PREVIEW_PATH, {
    items: [{ catalogueItemId: first.id, quantity: "2" }],
  });
  expect(await afterDeactivation.json()).toMatchObject({
    required: [],
    unresolved: [{ material: { id: materialId, status: MATERIAL_STATUS.INACTIVE } }],
  });
  const rejectedLink = await api.send(HTTP_METHODS.PUT, breakdownPath(first.id), {
    expectedRevision: 3,
    lines: [fixedLine(materialId, "1")],
  });
  expect(rejectedLink.status()).toBe(400);
});

test("measurement and included lines remain separate from fixed purchasing quantities", async ({
  api,
}) => {
  const item = await createCatalogueFixture();
  const fixedId = await createMaterial(api);
  const measuredId = await createMaterial(api, {
    unit: MATERIAL_UNIT.METRE,
    status: MATERIAL_STATUS.NEEDS_SPEC,
  });
  const includedId = await createMaterial(api);
  const conditionalId = await createMaterial(api);
  const saved = await api.send(HTTP_METHODS.PUT, breakdownPath(item.id), {
    expectedRevision: 0,
    lines: [
      fixedLine(fixedId, "0.1250", 0),
      {
        materialId: measuredId,
        basis: MATERIAL_BASIS.PROJECT_MEASUREMENT,
        quantityPerItem: null,
        displayOrder: 1,
      },
      {
        materialId: includedId,
        basis: MATERIAL_BASIS.INCLUDED,
        quantityPerItem: "1",
        displayOrder: 2,
      },
      {
        materialId: conditionalId,
        basis: MATERIAL_BASIS.CONDITIONAL,
        quantityPerItem: "1",
        displayOrder: 3,
      },
    ],
  });
  expect(saved.status()).toBe(200);
  const preview = await api.send(HTTP_METHODS.POST, PREVIEW_PATH, {
    items: [{ catalogueItemId: item.id, quantity: "2" }],
  });
  expect(await preview.json()).toMatchObject({
    required: [{ material: { id: fixedId }, quantity: "0.25000000" }],
    unresolved: [
      { material: { id: measuredId }, basis: MATERIAL_BASIS.PROJECT_MEASUREMENT, quantity: null },
      {
        material: { id: conditionalId },
        basis: MATERIAL_BASIS.CONDITIONAL,
        quantity: "2.00000000",
      },
    ],
    included: [{ material: { id: includedId }, quantity: "2.00000000" }],
  });
});

test("invalid links, revisions and quantities are rejected without changing current data", async ({
  api,
}) => {
  const item = await createCatalogueFixture();
  const materialId = await createMaterial(api);
  const invalidLines = [
    [fixedLine(materialId, "1"), fixedLine(materialId, "2", 1)],
    [fixedLine(materialId, "0")],
    [fixedLine(materialId, "1.00001")],
    [
      {
        materialId,
        basis: MATERIAL_BASIS.PROJECT_MEASUREMENT,
        quantityPerItem: "1",
        displayOrder: 0,
      },
    ],
    [fixedLine(randomUUID(), "1")],
  ];
  for (const lines of invalidLines) {
    const rejected = await api.send(HTTP_METHODS.PUT, breakdownPath(item.id), {
      expectedRevision: 0,
      lines,
    });
    expect(rejected.status()).toBe(400);
  }
  const current = await api.send(HTTP_METHODS.GET, breakdownPath(item.id));
  expect(await current.json()).toMatchObject({ revision: 0, lines: [] });
  expect((await api.send(HTTP_METHODS.GET, revisionPath(item.id, 1))).status()).toBe(404);
  expect(
    (
      await api.send(HTTP_METHODS.POST, PREVIEW_PATH, {
        items: [
          { catalogueItemId: item.id, quantity: "1" },
          { catalogueItemId: item.id, quantity: "2" },
        ],
      })
    ).status(),
  ).toBe(400);
  expect(
    (
      await api.send(HTTP_METHODS.POST, PREVIEW_PATH, {
        items: [{ catalogueItemId: item.id, quantity: "0" }],
      })
    ).status(),
  ).toBe(400);
  expect((await api.send(HTTP_METHODS.GET, breakdownPath(randomUUID()))).status()).toBe(404);
});

test("material routes require catalogue permission despite purchasing or finance roles", async ({
  apiAs,
}) => {
  for (const role of [USER_ROLES.PURCHASING_EXECUTION_MANAGER, USER_ROLES.FINANCE]) {
    const actor = await apiAs(TEST_USERS[role]);
    for (const [method, path, body] of [
      [HTTP_METHODS.GET, MATERIALS_PATH, null],
      [HTTP_METHODS.POST, MATERIALS_PATH, { code: uniqueCode() }],
      [HTTP_METHODS.POST, PREVIEW_PATH, { items: [] }],
      [HTTP_METHODS.PUT, breakdownPath(randomUUID()), { expectedRevision: 0, lines: [] }],
    ] as const) {
      expect((await actor.send(method, path, body)).status()).toBe(403);
    }
  }
});

test("material tables deny direct client roles and revisions reject mutation", async ({ api }) => {
  const item = await createCatalogueFixture();
  const materialId = await createMaterial(api);
  const saved = await api.send(HTTP_METHODS.PUT, breakdownPath(item.id), {
    expectedRevision: 0,
    lines: [fixedLine(materialId, "1")],
  });
  expect(saved.status()).toBe(200);
  const database = createTestDatabaseClient();
  await database.connect();
  try {
    const revision = await database.query<{ id: string }>(
      "SELECT id FROM catalogue_item_material_revisions WHERE catalogue_item_id=$1 AND revision=1",
      [item.id],
    );
    expect(revision.rows).toHaveLength(1);
    await expect(
      database.query("UPDATE catalogue_item_material_revisions SET lines='[]' WHERE id=$1", [
        revision.rows[0].id,
      ]),
    ).rejects.toThrow(/immutable/);
    await expect(
      database.query("DELETE FROM catalogue_item_material_revisions WHERE id=$1", [
        revision.rows[0].id,
      ]),
    ).rejects.toThrow(/immutable/);
    for (const table of [
      "materials",
      "catalogue_item_materials",
      "catalogue_item_material_revisions",
    ]) {
      const protection = await database.query<{ relrowsecurity: boolean }>(
        `SELECT relrowsecurity FROM pg_class WHERE oid='public.${table}'::regclass`,
      );
      expect(protection.rows).toEqual([{ relrowsecurity: true }]);
    }
    await database.query("SET ROLE authenticated");
    await expect(database.query("SELECT * FROM materials")).rejects.toThrow(/permission denied/);
    await database.query("RESET ROLE");
  } finally {
    await database.end();
  }
});
