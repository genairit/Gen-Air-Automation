import {
  saveQuotation,
  quotationWrite,
  createQuotation,
  quotationDocument,
} from "../../src/api/quotation.api.ts";

import { randomUUID } from "node:crypto";
import type { APIResponse } from "@playwright/test";
import type { TGenAirApi } from "../../src/api/gen-air-api.ts";
import { isRecord } from "../../src/utilities/guard.utility.ts";
import { test, expect } from "../../src/fixtures/test.fixture.ts";
import { HTTP_METHODS } from "../../src/constants/http.constant.ts";
import { QUOTATION } from "../../src/constants/quotation.constant.ts";
import { PAYMENT_TERMS } from "../../src/constants/domain.constant.ts";
import { USER_ROLES } from "../../src/constants/user-role.constant.ts";
import { TEST_USERS } from "../../src/constants/test-users.constant.ts";
import { seedCustomer, seedStandaloneProject } from "../../src/api/seed-data.ts";
import { createCatalogueFixture } from "../../src/environment/quotation-fixtures.ts";

const BOQ_REVIEW = { PENDING: "pending", CONFIRMED: "confirmed" } as const;
const MATERIAL_UNIT = { UNIT: "unit", METRE: "m" } as const;
const MATERIAL_STATUS = { ACTIVE: "active", INACTIVE: "inactive" } as const;
const MATERIAL_BASIS = { FIXED: "fixed", PROJECT_MEASUREMENT: "project_measurement" } as const;
const boqPath = (projectId: string) => `/project-boq/${projectId}`;
const readRecord = async (response: APIResponse): Promise<Record<string, unknown>> => {
  const value: unknown = await response.json();
  if (!isRecord(value)) throw new Error(`Expected object response, got ${response.status()}`);
  return value;
};
const requireId = (value: Record<string, unknown>): string => {
  if (typeof value.id !== "string") throw new Error("Expected ID in response");
  return value.id;
};
const requireRevision = (value: Record<string, unknown>): number => {
  if (typeof value.revision !== "number") throw new Error("Expected BOQ revision");
  return value.revision;
};
const requireLine = (value: Record<string, unknown>): Record<string, unknown> => {
  const lines = value.lines;
  if (!Array.isArray(lines) || !isRecord(lines[0])) throw new Error("Expected BOQ line");
  return lines[0];
};
type MaterialUnitType = (typeof MATERIAL_UNIT)[keyof typeof MATERIAL_UNIT];
const createMaterial = async (api: TGenAirApi, unit: MaterialUnitType = MATERIAL_UNIT.UNIT) => {
  const code = `BOQ-${randomUUID().toUpperCase()}`;
  const response = await api.send(HTTP_METHODS.POST, "/material", {
    code,
    name: `חומר QA ${code}`,
    category: "QA",
    specification: "Spec QA",
    unit,
    status: MATERIAL_STATUS.ACTIVE,
  });
  expect(response.status()).toBe(201);
  return { id: requireId(await readRecord(response)), code };
};
const fixture = async (api: TGenAirApi) => {
  const customer = await seedCustomer(api);
  const project = await seedStandaloneProject(api, customer);
  const catalogue = await createCatalogueFixture();
  const fixed = await createMaterial(api);
  const measured = await createMaterial(api, MATERIAL_UNIT.METRE);
  const breakdown = await api.send(HTTP_METHODS.PUT, `/catalogue-item/${catalogue.id}/materials`, {
    expectedRevision: 0,
    lines: [
      {
        materialId: fixed.id,
        basis: MATERIAL_BASIS.FIXED,
        quantityPerItem: "2.5000",
        displayOrder: 0,
      },
      {
        materialId: measured.id,
        basis: MATERIAL_BASIS.PROJECT_MEASUREMENT,
        quantityPerItem: null,
        displayOrder: 1,
      },
    ],
  });
  expect(breakdown.status()).toBe(200);
  const initial = await createQuotation(api, customer.id);
  const draft = await saveQuotation(api, initial.id, {
    ...quotationWrite(initial),
    projectId: project.id,
    brand: QUOTATION.BRAND,
    paymentTerms: PAYMENT_TERMS.PREPAID,
    sections: [
      {
        id: randomUUID(),
        title: "QA system",
        systemType: QUOTATION.SYSTEM.SINGLE,
        items: [
          {
            id: randomUUID(),
            catalogueItemId: catalogue.id,
            parentItemId: null,
            description: catalogue.description,
            quotedPrice: catalogue.price,
            quantity: "2",
            location: "QA room",
            circuit: null,
            requestedCapacityBtu: catalogue.capacityBtu,
          },
        ],
      },
    ],
  });
  const review = await quotationDocument(
    await api.send(HTTP_METHODS.POST, `/quotation/${draft.id}/review`, {
      version: draft.version,
      status: QUOTATION.STATUS.REVIEW,
    }),
  );
  const acknowledged = await quotationDocument(
    await api.send(HTTP_METHODS.POST, `/quotation/${draft.id}/warnings`, {
      version: review.version,
      warningKeys: review.warnings.map(warning => warning.key),
    }),
  );
  const approved = await quotationDocument(
    await api.send(HTTP_METHODS.POST, `/quotation/${draft.id}/review`, {
      version: acknowledged.version,
      status: QUOTATION.STATUS.APPROVED,
    }),
  );
  return { customer, project, catalogue, fixed, measured, approved };
};
const preview = async (api: TGenAirApi, projectId: string, quoteId: string) => {
  const response = await api.send(
    HTTP_METHODS.GET,
    `${boqPath(projectId)}/preview?quotationId=${quoteId}`,
  );
  expect(response.status()).toBe(200);
  return readRecord(response);
};
const generate = async (
  api: TGenAirApi,
  projectId: string,
  proposal: Record<string, unknown>,
  expectedRevision: number,
) => {
  const response = await api.send(HTTP_METHODS.POST, `${boqPath(projectId)}/generate`, {
    quotationId: proposal.quotationId,
    quotationVersion: proposal.quotationVersion,
    previewFingerprint: proposal.fingerprint,
    expectedRevision,
  });
  expect(response.status()).toBe(201);
  return readRecord(response);
};

test("approved source preview, BOQ generation, edits, manual additions and immutable revisions", async ({
  api,
}) => {
  const { project, fixed, measured, approved } = await fixture(api);
  const empty = await readRecord(await api.send(HTTP_METHODS.GET, boqPath(project.id)));
  expect(empty).toMatchObject({ revision: 0, lines: [], ledgerAvailable: false });
  const sourceResponse = await api.send(HTTP_METHODS.GET, `${boqPath(project.id)}/sources`);
  expect(sourceResponse.status()).toBe(200);
  expect(await sourceResponse.json()).toEqual(
    expect.arrayContaining([expect.objectContaining({ id: approved.id })]),
  );
  const proposal = await preview(api, project.id, approved.id);
  expect(proposal).toMatchObject({
    quotationId: approved.id,
    added: expect.any(Array),
    removed: [],
    includedCount: 0,
  });
  expect(proposal.lines).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        materialId: fixed.id,
        proposedQuantity: "5.00000000",
        requiredQuantity: "5.00000000",
        reviewState: BOQ_REVIEW.CONFIRMED,
      }),
      expect.objectContaining({
        materialId: measured.id,
        proposedQuantity: null,
        requiredQuantity: null,
        reviewState: BOQ_REVIEW.PENDING,
      }),
    ]),
  );
  const generated = await generate(api, project.id, proposal, 0);
  expect(generated).toMatchObject({
    revision: 1,
    sourceQuotationId: approved.id,
    sourceQuotationVersion: approved.version,
    ledgerAvailable: false,
    estimatedTotal: "0.0000",
    missingCostCount: 2,
    unresolvedCount: 1,
  });
  const fixedLine = Array.isArray(generated.lines)
    ? generated.lines.find(line => isRecord(line) && line.materialId === fixed.id)
    : null;
  if (!isRecord(fixedLine) || typeof fixedLine.id !== "string")
    throw new Error("Expected generated fixed line");
  const updatedResponse = await api.send(
    HTTP_METHODS.PATCH,
    `${boqPath(project.id)}/lines/${fixedLine.id}`,
    {
      expectedRevision: 1,
      requiredQuantity: "5",
      estimatedUnitCost: "10.2500",
      reviewState: BOQ_REVIEW.CONFIRMED,
      notes: "Estimated purchase price",
    },
  );
  expect(updatedResponse.status()).toBe(200);
  const updated = await readRecord(updatedResponse);
  expect(updated).toMatchObject({ revision: 2, estimatedTotal: "51.2500", missingCostCount: 1 });
  expect(requireLine(updated)).toMatchObject({
    materialId: fixed.id,
    quantityOverridden: true,
    estimatedUnitCost: "10.2500",
  });
  const firstRevision = await readRecord(
    await api.send(HTTP_METHODS.GET, `${boqPath(project.id)}/revisions/1`),
  );
  expect(firstRevision).toMatchObject({ revision: 1, sourceQuotationId: approved.id });
  expect(firstRevision.lines).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ materialId: fixed.id, estimatedUnitCost: null }),
    ]),
  );
  const addedMaterial = await createMaterial(api);
  const addedResponse = await api.send(HTTP_METHODS.POST, `${boqPath(project.id)}/lines`, {
    expectedRevision: 2,
    materialId: addedMaterial.id,
    systemTitle: "Manual system",
    componentTitle: "Manual component",
    requiredQuantity: "3",
    estimatedUnitCost: "7.50",
    reviewState: BOQ_REVIEW.CONFIRMED,
    notes: "Confirmed manual",
  });
  expect(addedResponse.status()).toBe(201);
  const added = await readRecord(addedResponse);
  expect(added).toMatchObject({ revision: 3, estimatedTotal: "73.7500" });
  expect(added.lines).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ materialId: addedMaterial.id, sourceBasis: "manual" }),
    ]),
  );
  const regenerated = await generate(
    api,
    project.id,
    await preview(api, project.id, approved.id),
    3,
  );
  expect(regenerated).toMatchObject({ revision: 4 });
  expect(regenerated.lines).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ materialId: addedMaterial.id, requiredQuantity: "3.00000000" }),
    ]),
  );
  expect(
    (await readRecord(await api.send(HTTP_METHODS.GET, `${boqPath(project.id)}/revisions/1`)))
      .lines,
  ).toEqual(firstRevision.lines);
});

test("BOQ source, revision and quantity guards reject invalid writes without changing state", async ({
  api,
  apiAs,
}) => {
  const { project, fixed, approved } = await fixture(api);
  const other = await seedStandaloneProject(api, await seedCustomer(api));
  expect(
    (
      await api.send(HTTP_METHODS.GET, `${boqPath(other.id)}/preview?quotationId=${approved.id}`)
    ).status(),
  ).toBe(400);
  const proposal = await preview(api, project.id, approved.id);
  const stale = await api.send(HTTP_METHODS.POST, `${boqPath(project.id)}/generate`, {
    quotationId: approved.id,
    quotationVersion: approved.version,
    previewFingerprint: "0".repeat(64),
    expectedRevision: 0,
  });
  expect(stale.status()).toBe(409);
  const statusChange = await api.send(HTTP_METHODS.PATCH, `/material/${fixed.id}`, {
    status: MATERIAL_STATUS.INACTIVE,
  });
  expect(statusChange.status()).toBe(200);
  const changedProposal = await preview(api, project.id, approved.id);
  expect(changedProposal.fingerprint).not.toBe(proposal.fingerprint);
  expect(changedProposal.lines).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        materialId: fixed.id,
        requiredQuantity: null,
        reviewState: BOQ_REVIEW.PENDING,
      }),
    ]),
  );
  const outdated = await api.send(HTTP_METHODS.POST, `${boqPath(project.id)}/generate`, {
    quotationId: approved.id,
    quotationVersion: approved.version,
    previewFingerprint: proposal.fingerprint,
    expectedRevision: 0,
  });
  expect(outdated.status()).toBe(409);
  const generated = await generate(api, project.id, changedProposal, 0);
  const line = requireLine(generated);
  if (typeof line.id !== "string") throw new Error("Expected line ID");
  const invalid = await api.send(HTTP_METHODS.PATCH, `${boqPath(project.id)}/lines/${line.id}`, {
    expectedRevision: 1,
    requiredQuantity: "-1",
    estimatedUnitCost: "1",
    reviewState: BOQ_REVIEW.CONFIRMED,
    notes: "",
  });
  expect(invalid.status()).toBe(400);
  const staleEdit = await api.send(HTTP_METHODS.PATCH, `${boqPath(project.id)}/lines/${line.id}`, {
    expectedRevision: 0,
    requiredQuantity: "6",
    estimatedUnitCost: "1",
    reviewState: BOQ_REVIEW.CONFIRMED,
    notes: "",
  });
  expect(staleEdit.status()).toBe(400);
  expect(
    requireRevision(await readRecord(await api.send(HTTP_METHODS.GET, boqPath(project.id)))),
  ).toBe(1);
  const engineer = await apiAs(TEST_USERS[USER_ROLES.ENGINEER]);
  expect((await engineer.send(HTTP_METHODS.GET, boqPath(project.id))).status()).toBe(403);
  expect(
    (
      await engineer.send(HTTP_METHODS.POST, `${boqPath(project.id)}/generate`, {
        quotationId: approved.id,
        quotationVersion: approved.version,
        previewFingerprint: proposal.fingerprint,
        expectedRevision: 1,
      })
    ).status(),
  ).toBe(403);
  const purchasing = await apiAs(TEST_USERS[USER_ROLES.PURCHASING_EXECUTION_MANAGER]);
  expect((await purchasing.send(HTTP_METHODS.GET, boqPath(project.id))).status()).toBe(200);
});

test("regeneration sends an unoverridden inactive material back for review", async ({ api }) => {
  const { project, fixed, approved } = await fixture(api);
  const initial = await generate(api, project.id, await preview(api, project.id, approved.id), 0);
  expect(initial.lines).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        materialId: fixed.id,
        requiredQuantity: "5.00000000",
        reviewState: BOQ_REVIEW.CONFIRMED,
      }),
    ]),
  );
  const statusChange = await api.send(HTTP_METHODS.PATCH, `/material/${fixed.id}`, {
    status: MATERIAL_STATUS.INACTIVE,
  });
  expect(statusChange.status()).toBe(200);
  const refreshed = await preview(api, project.id, approved.id);
  expect(refreshed.lines).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        materialId: fixed.id,
        requiredQuantity: null,
        reviewState: BOQ_REVIEW.PENDING,
      }),
    ]),
  );
  const regenerated = await generate(api, project.id, refreshed, 1);
  expect(regenerated).toMatchObject({ revision: 2, unresolvedCount: 2 });
  expect(regenerated.lines).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        materialId: fixed.id,
        requiredQuantity: null,
        reviewState: BOQ_REVIEW.PENDING,
      }),
    ]),
  );
});

test("procurement manager opens project BOQ, selects approved source and sees editable cost with ledger unavailable", async ({
  api,
  openPageAs,
}) => {
  const { project, fixed, approved } = await fixture(api);
  const page = await openPageAs(TEST_USERS[USER_ROLES.PURCHASING_EXECUTION_MANAGER]);
  await page.goto("/project-boqs");
  await expect(page.getByRole("heading", { name: "כתבי רכש לפרויקטים" })).toBeVisible();
  await page.getByText(project.name, { exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/project-boqs/${project.id}$`));
  await expect(page.getByText("לא זמין עדיין").first()).toBeVisible();
  await expect(page.getByText("טרם נבחרה הצעה")).toBeVisible();
  await page.getByRole("combobox", { name: "בחר הצעת מחיר מאושרת" }).click();
  await page.getByRole("option", { name: new RegExp(approved.number) }).click();
  await page.getByRole("button", { name: "הצג שינויים" }).click();
  await expect(page.getByText(/2 שורות חומר מוצעות/)).toBeVisible();
  await page.getByRole("button", { name: "צור כתב רכש" }).click();
  await expect(page.getByText(`הצעה ${approved.number} · גרסה ${approved.version}`)).toBeVisible();
  await expect(page.getByText("לא זמין עדיין")).toHaveCount(3);
  const materialRow = page.getByText(fixed.code).locator("..", { hasText: fixed.code });
  await expect(materialRow).toBeVisible();
  await page.getByPlaceholder("לא הוזנה").first().fill("12.50");
  await page.getByRole("button", { name: "שמור" }).first().click();
  await expect(page.getByText("₪62.5")).toHaveCount(2);
  const stored = await readRecord(await api.send(HTTP_METHODS.GET, boqPath(project.id)));
  expect(stored).toMatchObject({ revision: 2, estimatedTotal: "62.5000", ledgerAvailable: false });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByText(fixed.code).first()).toBeVisible();
  await expect(page.getByPlaceholder("לא הוזנה").first()).toHaveValue("12.5000");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
});
