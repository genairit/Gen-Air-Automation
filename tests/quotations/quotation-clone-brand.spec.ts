import {
  saveQuotation,
  quotationPage,
  quotationWrite,
  createQuotation,
  quotationDocument,
} from "../../src/api/quotation.api.ts";

import type {
  IQuotationLine,
  ICatalogueFixture,
  IQuotationDocument,
  IQuotationWriteLine,
} from "../../src/interfaces/quotation.interface.ts";

import { randomUUID } from "node:crypto";
import type { Page } from "@playwright/test";
import type { TGenAirApi } from "../../src/api/gen-air-api.ts";
import { isRecord } from "../../src/utilities/guard.utility.ts";
import { createLoginPage } from "../../src/pages/login.page.ts";
import { test, expect } from "../../src/fixtures/test.fixture.ts";
import { createAppShell } from "../../src/pages/app-shell.page.ts";
import { HTTP_METHODS } from "../../src/constants/http.constant.ts";
import { QUOTATION } from "../../src/constants/quotation.constant.ts";
import { USER_ROLES } from "../../src/constants/user-role.constant.ts";
import { TEST_USERS } from "../../src/constants/test-users.constant.ts";
import { createQuotationPage } from "../../src/pages/quotation.page.ts";
import { KEYBOARD_KEYS } from "../../src/constants/keyboard.constant.ts";
import { createDeferred } from "../../src/utilities/deferred.utility.ts";
import { PERMISSIONS } from "../../src/constants/permission.constant.ts";
import { selectMuiOption } from "../../src/pages/mui-select.component.ts";
import { withRolePermissions } from "../../src/environment/role-permissions.ts";
import { PAYMENT_TERMS, TASK_TYPES } from "../../src/constants/domain.constant.ts";
import { createCatalogueFixture } from "../../src/environment/quotation-fixtures.ts";
import { taskQuotationQuery } from "../../src/environment/task-quotation-fixtures.ts";
import { createTestDatabaseClient } from "../../src/environment/test-database-client.ts";
import { seedApartment, seedBuilding, seedCustomer, seedUser } from "../../src/api/seed-data.ts";

interface IRecommendedInput {
  targetBrand: string;
  sourceVersion: number;
  idempotencyKey: string;
}
interface ILegacyInput {
  targetBrand: string;
  sourceVersion: number;
  mappings: { sourceLineId: string; targetCatalogueItemId: string }[];
}
interface ICloneFixture {
  source: IQuotationDocument;
  general: ICatalogueFixture;
  wrongRole: ICatalogueFixture;
  wrongType: ICatalogueFixture;
  sourceItem: ICatalogueFixture;
  replacement: ICatalogueFixture;
  wrongSystem: ICatalogueFixture;
  zeroCapacity: ICatalogueFixture;
  salesAgent: Awaited<ReturnType<typeof seedUser>>;
  project: Awaited<ReturnType<typeof seedBuilding>>;
  customer: Awaited<ReturnType<typeof seedCustomer>>;
}
const CLONE_SCENARIOS = {
  HEIGHT: 1000,
  COMMAND_KEY_PATTERN: /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
  CAPACITY_MINIMUM: 100000,
  CAPACITY_RANGE: 100000000,
  UUID_CAPACITY_DIGITS: 8,
  CONCURRENT_REQUESTS: 4,
  INVALID_BRAND: "QA-invalid-brand",
  RECOVERY_STATES: ["unavailable", "General", "targetBrand"],
  WIDTHS: [1440, 900, 390],
  UNMATCHED_TYPE: "QA unmatched equipment type",
} as const;
const recordedCommand = (value: unknown): IRecommendedInput => {
  if (!isRecord(value)) {
    throw new Error("Clone command must be an object");
  }

  const { targetBrand, sourceVersion, idempotencyKey } = value;
  if (
    typeof targetBrand !== "string" ||
    typeof sourceVersion !== "number" ||
    typeof idempotencyKey !== "string"
  ) {
    throw new Error("Clone command must contain a brand, source version and idempotency key");
  }

  return { targetBrand, sourceVersion, idempotencyKey };
};
const recommendedPath = (id: string): string => `/quotation/${id}/clone-recommended`;
const recommendedInput = (source: IQuotationDocument): IRecommendedInput => ({
  sourceVersion: source.version,
  targetBrand: QUOTATION.OTHER_BRAND,
  idempotencyKey: randomUUID(),
});
const cloneQuery = async (sql: string, parameters: string[]): Promise<void> => {
  const database = createTestDatabaseClient();
  await database.connect();
  try {
    await database.query(sql, parameters);
  } finally {
    await database.end();
  }
};

const quotePath = (id: string): string => `/quotation/${id}`;
const clonePath = (id: string): string => `${quotePath(id)}/clone`;
const firstBrandLine = (quotation: IQuotationDocument): IQuotationLine => {
  const item = quotation.sections.find((section): boolean => section.brand === QUOTATION.BRAND)
    ?.items[0];
  if (!item) {
    throw new Error(`Missing source brand line in quotation ${quotation.id}`);
  }

  return item;
};
const quotationIdFromPage = (page: Page): string => {
  const match = new URL(page.url()).pathname.match(/^\/quotations\/([0-9a-f-]{36})$/i);
  if (!match?.[1]) {
    throw new Error(`Expected quotation detail URL, received ${page.url()}`);
  }

  return match[1];
};
const quotationIds = async (api: TGenAirApi): Promise<string[]> => {
  const collect = async (cursor: string | null, ids: string[]): Promise<string[]> => {
    const path = `/quotation?batchSize=50${cursor ? `&batchCursor=${encodeURIComponent(cursor)}` : ""}`;
    const page = await quotationPage(await api.send(HTTP_METHODS.GET, path));
    const nextIds = [...ids, ...page.items.map((quotation): string => quotation.id)];
    return page.nextCursor ? collect(page.nextCursor, nextIds) : nextIds.sort();
  };
  return collect(null, []);
};
const line = (
  catalogueItemId: string,
  description: string,
  quantity = "1",
): IQuotationWriteLine => ({
  id: randomUUID(),
  catalogueItemId,
  parentItemId: null,
  description,
  quotedPrice: "17.2500",
  quantity,
  location: "QA room",
  circuit: null,
  requestedCapacityBtu: 24000,
});
const sourceFixture = async (api: TGenAirApi): Promise<ICloneFixture> => {
  const capacityBtu =
    CLONE_SCENARIOS.CAPACITY_MINIMUM +
    (Number.parseInt(randomUUID().slice(0, CLONE_SCENARIOS.UUID_CAPACITY_DIGITS), 16) %
      CLONE_SCENARIOS.CAPACITY_RANGE);
  const customer = await seedCustomer(api);
  const project = await seedBuilding(api, customer);
  const salesAgent = await seedUser(api, USER_ROLES.ENGINEER);
  const sourceItem = await createCatalogueFixture({
    capacityBtu,
    description: "Source unit",
    price: "111",
    equipmentTypes: ["עילי"],
  });
  const replacement = await createCatalogueFixture({
    brand: QUOTATION.OTHER_BRAND,
    capacityBtu,
    description: "Compatible replacement",
    price: "222",
    equipmentTypes: ["עילי"],
  });
  const wrongRole = await createCatalogueFixture({
    brand: QUOTATION.OTHER_BRAND,
    equipmentRole: QUOTATION.ROLE.CONTROL,
    description: "Wrong role",
  });
  const wrongType = await createCatalogueFixture({
    brand: QUOTATION.OTHER_BRAND,
    equipmentTypes: ["נסתר"],
    description: "Wrong type",
  });
  const wrongSystem = await createCatalogueFixture({
    brand: QUOTATION.OTHER_BRAND,
    systemType: QUOTATION.SYSTEM.VRF,
    equipmentTypes: ["עילי"],
    description: "Wrong system",
  });
  const zeroCapacity = await createCatalogueFixture({
    brand: QUOTATION.OTHER_BRAND,
    capacityBtu: 0,
    equipmentTypes: ["עילי"],
    description: "Zero capacity",
  });
  const general = await createCatalogueFixture({
    brand: "",
    systemType: QUOTATION.SYSTEM.GENERAL,
    equipmentRole: QUOTATION.ROLE.OTHER,
    description: "General fixture",
    capacityBtu: null,
  });
  const initial = await quotationDocument(
    await api.send(HTTP_METHODS.POST, "/quotation", {
      customerId: customer.id,
      salesAgentId: salesAgent.id,
    }),
  );
  const source = await saveQuotation(api, initial.id, {
    ...quotationWrite(initial),
    brand: QUOTATION.BRAND,
    projectId: project.id,
    paymentTerms: PAYMENT_TERMS.PREPAID,
    paymentTermsNote: "Clone terms",
    discountPercent: "12",
    sections: [
      {
        id: randomUUID(),
        title: "Brand room",
        systemType: QUOTATION.SYSTEM.SINGLE,
        brand: QUOTATION.BRAND,
        items: [line(sourceItem.id, "Brand snapshot", "2")],
      },
      {
        id: randomUUID(),
        title: "General room",
        systemType: QUOTATION.SYSTEM.GENERAL,
        brand: null,
        items: [line(general.id, "General snapshot", "3")],
      },
    ],
  });
  return {
    source,
    sourceItem,
    replacement,
    wrongRole,
    wrongType,
    wrongSystem,
    zeroCapacity,
    general,
    customer,
    project,
    salesAgent,
  };
};
const cloneInput = (source: IQuotationDocument, targetId: string): ILegacyInput => ({
  sourceVersion: source.version,
  targetBrand: QUOTATION.OTHER_BRAND,
  mappings: [{ sourceLineId: firstBrandLine(source).id, targetCatalogueItemId: targetId }],
});

test("API clone creates a separate draft, preserves General snapshots and project context, and leaves source unchanged", async ({
  api,
}): Promise<void> => {
  const fixture = await sourceFixture(api);
  const { source, replacement, customer, project } = fixture;
  const before = await quotationDocument(await api.send(HTTP_METHODS.GET, quotePath(source.id)));
  const beforeDate = new Date().toISOString().slice(0, 10);
  const response = await api.send(
    HTTP_METHODS.POST,
    clonePath(source.id),
    cloneInput(source, replacement.id),
  );
  const afterDate = new Date().toISOString().slice(0, 10);
  expect(response.status()).toBe(201);
  const copy = await quotationDocument(response);
  expect(copy.id).not.toBe(source.id);
  expect(copy.number).not.toBe(source.number);
  expect(copy.status).toBe(QUOTATION.STATUS.DRAFT);
  expect(copy.version).toBe(1);
  expect([beforeDate, afterDate]).toContain(copy.date);
  expect(copy.discountPercent).toBe("0.0000");
  expect(copy.approvedAt).toBeNull();
  expect(copy.approvedById).toBeNull();
  expect(copy.cancellationHistory).toEqual([]);
  expect(copy.brands).toEqual([QUOTATION.OTHER_BRAND]);
  expect(copy.customerId).toBe(customer.id);
  expect(copy.projectId).toBe(project.id);
  expect(copy.salesAgentId).toBe(source.salesAgentId);
  expect(copy.paymentTerms).toBe(source.paymentTerms);
  expect(copy.paymentTermsNote).toBe(source.paymentTermsNote);
  expect(copy.paymentSchedule).toEqual(source.paymentSchedule);
  expect(copy.sections.map((section): string | null => section.brand)).toEqual([
    QUOTATION.OTHER_BRAND,
    null,
  ]);
  expect(copy.sections[0]?.items[0]).toMatchObject({
    catalogueItemId: replacement.id,
    description: replacement.description,
    quantity: source.sections[0]?.items[0]?.quantity,
  });
  expect(copy.sections[0]?.items[0]?.id).not.toBe(source.sections[0]?.items[0]?.id);
  expect(copy.sections[1]?.items[0]).toMatchObject({
    catalogueItemId: fixture.general.id,
    sku: source.sections[1]?.items[0]?.sku,
    description: source.sections[1]?.items[0]?.description,
    quotedPrice: source.sections[1]?.items[0]?.quotedPrice,
    quantity: source.sections[1]?.items[0]?.quantity,
    location: source.sections[1]?.items[0]?.location,
  });
  expect(copy.sections[1]?.items[0]?.id).not.toBe(source.sections[1]?.items[0]?.id);
  expect(await quotationDocument(await api.send(HTTP_METHODS.GET, quotePath(source.id)))).toEqual(
    before,
  );
});

test("brand choice and native Enter immediately create an editable draft without catalogue queries or review cards", async ({
  api,
  page,
}): Promise<void> => {
  const { source } = await sourceFixture(api);
  const requests: string[] = [];
  page.on("request", (request): void => {
    if (new URL(request.url()).pathname === "/catalogue-item") {
      requests.push(request.url());
    }
  });
  const editor = createQuotationPage(page);
  await editor.goto(source.id);
  await editor.button("צור העתק לחברה אחרת").click();
  await expect(page).toHaveURL(new RegExp(`cloneFrom=${source.id}`));
  const create = page.getByRole("button", { name: "צור הצעה חדשה", exact: true });
  await expect(create).toBeDisabled();
  await selectMuiOption(page, page.getByLabel("חברת מיזוג חדשה"), QUOTATION.OTHER_BRAND);
  await expect(page.getByRole("region", { name: /^חלופה לפריט / })).toHaveCount(0);
  await expect(
    page
      .getByRole("region", { name: "יצירת העתק לחברת מיזוג אחרת", exact: true })
      .getByRole("searchbox"),
  ).toHaveCount(0);
  await expect(create).toBeEnabled();
  expect(requests).toEqual([]);
  await create.focus();
  await page.keyboard.press(KEYBOARD_KEYS.ENTER);
  await expect(page).toHaveURL(/\/quotations\/[\w-]+#quotation-detail-heading$/);
  expect(requests).toEqual([]);
  const copy = await quotationDocument(
    await api.send(HTTP_METHODS.GET, quotePath(quotationIdFromPage(page))),
  );
  expect(copy.brands).toEqual([QUOTATION.OTHER_BRAND]);
  expect(copy.status).toBe(QUOTATION.STATUS.DRAFT);
  expect(copy.sections[1]?.items[0]?.description).toBe(source.sections[1]?.items[0]?.description);
  await expect(page.getByRole("heading", { name: copy.number, exact: true })).toBeFocused();
  await editor.fill("מיקום", "Editable cloned room");
  expect(
    (await quotationDocument(await api.send(HTTP_METHODS.GET, quotePath(copy.id)))).sections[0]
      ?.items[0]?.location,
  ).toBe("Editable cloned room");
  expect(await quotationDocument(await api.send(HTTP_METHODS.GET, quotePath(source.id)))).toEqual(
    source,
  );
});

test("one Create resolves every branded line and double clicks create only one draft", async ({
  api,
  page,
}): Promise<void> => {
  const { source } = await sourceFixture(api);
  const secondItem = await createCatalogueFixture({ equipmentTypes: ["עילי"] });
  const write = quotationWrite(source);
  const section = write.sections[0];
  if (!section) {
    throw new Error("Missing source section");
  }

  section.items.push(line(secondItem.id, "Second branded line"));
  const updated = await saveQuotation(api, source.id, write);
  const beforeIds = await quotationIds(api);
  const observed = createDeferred();
  const release = createDeferred();
  const commands: object[] = [];
  await page.route("**/clone-recommended", async (route): Promise<void> => {
    commands.push(route.request().postDataJSON());
    observed.resolve();
    await release.promise;
    await route.continue();
  });
  await page.goto(`/quotations?cloneFrom=${updated.id}`);
  await selectMuiOption(page, page.getByLabel("חברת מיזוג חדשה"), QUOTATION.OTHER_BRAND);
  const create = page.getByRole("button", { name: "צור הצעה חדשה", exact: true });
  await create.dblclick();
  await observed.promise;
  await expect(page.getByRole("button", { name: "יוצר הצעה חדשה...", exact: true })).toBeDisabled();
  await expect(page.getByLabel("חברת מיזוג חדשה")).toHaveAttribute("aria-disabled", "true");
  await expect(page.locator("form[aria-busy=true]")).toBeVisible();
  release.resolve();
  await expect(page).toHaveURL(/\/quotations\/[\w-]+#quotation-detail-heading$/);
  expect(commands).toHaveLength(1);
  const copy = await quotationDocument(
    await api.send(HTTP_METHODS.GET, quotePath(quotationIdFromPage(page))),
  );
  expect(copy.sections[0]?.items).toHaveLength(2);
  expect((await quotationIds(api)).filter((id): boolean => !beforeIds.includes(id))).toEqual([
    copy.id,
  ]);
});

test("recommended clone ranks actor usage within the exact target brand and nearest capacity", async ({
  api,
  apiAs,
}): Promise<void> => {
  const { source, sourceItem, customer } = await sourceFixture(api);
  const engineer = await apiAs(await seedUser(api, USER_ROLES.SYSTEM_ADMIN));
  const used = await createCatalogueFixture({
    brand: QUOTATION.OTHER_BRAND,
    equipmentTypes: ["עילי"],
    capacityBtu: sourceItem.capacityBtu,
    sku: `ZZ-used-${randomUUID()}`,
  });
  const nearer = await createCatalogueFixture({
    brand: QUOTATION.OTHER_BRAND,
    equipmentTypes: ["עילי"],
    capacityBtu: (sourceItem.capacityBtu ?? 0) + 1,
    sku: `AA-nearer-${randomUUID()}`,
  });
  const initial = await createQuotation(engineer, customer.id);
  await saveQuotation(engineer, initial.id, {
    ...quotationWrite(initial),
    brand: QUOTATION.OTHER_BRAND,
    sections: [
      {
        id: randomUUID(),
        title: "Actor usage",
        systemType: QUOTATION.SYSTEM.SINGLE,
        brand: QUOTATION.OTHER_BRAND,
        items: [line(used.id, "Actor's used replacement")],
      },
    ],
  });
  const copy = await quotationDocument(
    await engineer.send(HTTP_METHODS.POST, recommendedPath(source.id), recommendedInput(source)),
  );
  expect(copy.sections[0]?.items[0]?.catalogueItemId).toBe(used.id);
  expect(copy.sections[0]?.items[0]?.catalogueItemId).not.toBe(nearer.id);
  const otherActorCopy = await quotationDocument(
    await api.send(HTTP_METHODS.POST, recommendedPath(source.id), recommendedInput(source)),
  );
  expect(otherActorCopy.sections[0]?.items[0]?.catalogueItemId).not.toBe(used.id);
});

test("cloning an approved building quotation keeps apartment links while resetting approval", async ({
  api,
}): Promise<void> => {
  const { source, replacement, project } = await sourceFixture(api);
  const apartment = await seedApartment(api, project);
  const review = await quotationDocument(
    await api.send(HTTP_METHODS.POST, `${quotePath(source.id)}/review`, {
      version: source.version,
      status: QUOTATION.STATUS.REVIEW,
    }),
  );
  const acknowledged = await quotationDocument(
    await api.send(HTTP_METHODS.POST, `${quotePath(source.id)}/warnings`, {
      version: review.version,
      warningKeys: review.warnings.map((warning): string => warning.key),
    }),
  );
  const approved = await quotationDocument(
    await api.send(HTTP_METHODS.POST, `${quotePath(source.id)}/review`, {
      version: acknowledged.version,
      status: QUOTATION.STATUS.APPROVED,
    }),
  );
  const linkedResponse = await api.send(
    HTTP_METHODS.PUT,
    `${quotePath(source.id)}/apartment-links`,
    {
      apartmentIds: [apartment.id],
      expectedApartmentIds: [],
    },
  );
  expect(linkedResponse.status()).toBe(200);
  const response = await api.send(
    HTTP_METHODS.POST,
    clonePath(source.id),
    cloneInput(approved, replacement.id),
  );
  expect(response.status()).toBe(201);
  const copy = await quotationDocument(response);
  expect(copy.status).toBe(QUOTATION.STATUS.DRAFT);
  expect(copy.approvedAt).toBeNull();
  expect(copy.approvedById).toBeNull();
  const detail: { apartmentLinks: { apartmentId: string }[] } = await (
    await api.send(HTTP_METHODS.GET, quotePath(copy.id))
  ).json();
  expect(detail.apartmentLinks.map((link): string => link.apartmentId)).toEqual([apartment.id]);
  expect(
    (await quotationDocument(await api.send(HTTP_METHODS.GET, quotePath(source.id)))).status,
  ).toBe(QUOTATION.STATUS.APPROVED);
});

test("recommended clone preserves staged payment snapshots when the source catalogue entry is retired", async ({
  api,
  page,
}): Promise<void> => {
  const { source, sourceItem } = await sourceFixture(api);
  const staged = await saveQuotation(api, source.id, {
    ...quotationWrite(source),
    paymentTerms: null,
    paymentSchedule: [{ percent: "100", text: "Before delivery" }],
  });
  await cloneQuery("UPDATE catalogue_items SET status='archived' WHERE id=$1", [sourceItem.id]);
  await page.goto(`/quotations?cloneFrom=${staged.id}`);
  await selectMuiOption(page, page.getByLabel("חברת מיזוג חדשה"), QUOTATION.OTHER_BRAND);
  await page.getByRole("button", { name: "צור הצעה חדשה", exact: true }).click();
  await expect(page).toHaveURL(/\/quotations\/[\w-]+#quotation-detail-heading$/);
  const copy = await quotationDocument(
    await api.send(HTTP_METHODS.GET, quotePath(quotationIdFromPage(page))),
  );
  expect(copy.paymentTerms).toBeNull();
  expect(copy.paymentSchedule).toEqual(staged.paymentSchedule);
});

test("multi-brand source hides clone action, direct clone page rejects, and API rejects", async ({
  api,
  page,
}): Promise<void> => {
  const { source, replacement } = await sourceFixture(api);
  const other = await createCatalogueFixture({ brand: QUOTATION.OTHER_BRAND });
  const multi = await saveQuotation(api, source.id, {
    ...quotationWrite(source),
    brands: [QUOTATION.BRAND, QUOTATION.OTHER_BRAND],
    sections: [
      ...quotationWrite(source).sections,
      {
        id: randomUUID(),
        title: "Second brand",
        brand: QUOTATION.OTHER_BRAND,
        systemType: QUOTATION.SYSTEM.SINGLE,
        items: [line(other.id, "Second brand")],
      },
    ],
  });
  expect(multi.brands).toHaveLength(2);
  await createQuotationPage(page).goto(multi.id);
  await expect(page.getByRole("button", { name: "צור העתק לחברה אחרת" })).toHaveCount(0);
  await page.goto(`/quotations?cloneFrom=${multi.id}`);
  await expect(page.getByRole("alert")).toContainText("אפשר לשכפל רק הצעה עם חברת מיזוג אחת");
  const response = await api.send(HTTP_METHODS.POST, clonePath(multi.id), {
    sourceVersion: multi.version,
    targetBrand: QUOTATION.OTHER_BRAND,
    mappings: [{ sourceLineId: firstBrandLine(multi).id, targetCatalogueItemId: replacement.id }],
  });
  expect(response.status()).toBe(400);
});

test("clone action and API require quotation create permission", async ({
  api,
  apiAs,
  openPageAs,
}): Promise<void> => {
  const { source, replacement } = await sourceFixture(api);
  await withRolePermissions(
    USER_ROLES.ENGINEER,
    [PERMISSIONS.QUOTATIONS_READ, PERMISSIONS.PROJECTS_READ],
    async (): Promise<void> => {
      const engineer = await apiAs(TEST_USERS[USER_ROLES.ENGINEER]);
      const response = await engineer.send(
        HTTP_METHODS.POST,
        clonePath(source.id),
        cloneInput(source, replacement.id),
      );
      expect(response.status()).toBe(403);
      const engineerPage = await openPageAs(TEST_USERS[USER_ROLES.ENGINEER]);
      await createQuotationPage(engineerPage).goto(source.id);
      await expect(engineerPage.getByRole("button", { name: "צור העתק לחברה אחרת" })).toHaveCount(
        0,
      );
      await engineerPage.goto(`/quotations?cloneFrom=${source.id}`);
      await expect(engineerPage.getByRole("alert")).toContainText("אין הרשאה לשכפל הצעת מחיר");
    },
  );
});

test("API rejects missing, stale, same-brand and incompatible mappings without creating a copy", async ({
  api,
}): Promise<void> => {
  const { source, wrongRole, wrongType, wrongSystem, zeroCapacity, replacement } =
    await sourceFixture(api);
  const base = cloneInput(source, replacement.id);
  const mapping = base.mappings[0];
  if (!mapping) {
    throw new Error(`Missing clone mapping for quotation ${source.id}`);
  }

  const withTarget = (targetCatalogueItemId: string): ILegacyInput => ({
    ...base,
    mappings: [{ ...mapping, targetCatalogueItemId }],
  });
  const beforeIds = await quotationIds(api);
  for (const [caseName, scenario] of Object.entries({
    missing: { request: { ...base, mappings: [] }, expectedStatus: 400 },
    wrongRole: { request: withTarget(wrongRole.id), expectedStatus: 400 },
    wrongType: { request: withTarget(wrongType.id), expectedStatus: 400 },
    wrongSystem: { request: withTarget(wrongSystem.id), expectedStatus: 400 },
    zeroCapacity: { request: withTarget(zeroCapacity.id), expectedStatus: 400 },
    missingTarget: { request: withTarget(randomUUID()), expectedStatus: 400 },
    sameBrand: { request: { ...base, targetBrand: QUOTATION.BRAND }, expectedStatus: 400 },
    staleVersion: { request: { ...base, sourceVersion: source.version + 1 }, expectedStatus: 409 },
  })) {
    const response = await api.send(HTTP_METHODS.POST, clonePath(source.id), scenario.request);
    expect(response.status(), caseName).toBe(scenario.expectedStatus);
    expect(await quotationIds(api), caseName).toEqual(beforeIds);
  }
  expect(
    (await quotationDocument(await api.send(HTTP_METHODS.GET, quotePath(source.id)))).version,
  ).toBe(source.version);
});

for (const width of CLONE_SCENARIOS.WIDTHS) {
  test(`immediate clone form is compact RTL without overflow at ${width}px`, async ({
    api,
    page,
  }): Promise<void> => {
    const { source } = await sourceFixture(api);
    await page.setViewportSize({ width, height: CLONE_SCENARIOS.HEIGHT });
    await page.goto(`/quotations?cloneFrom=${source.id}`);
    const form = page.getByRole("region", { name: "יצירת העתק לחברת מיזוג אחרת", exact: true });
    await expect(form).toHaveCSS("direction", "rtl");
    await selectMuiOption(page, page.getByLabel("חברת מיזוג חדשה"), QUOTATION.OTHER_BRAND);
    await expect(page.getByRole("region", { name: /^חלופה לפריט / })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "צור הצעה חדשה", exact: true })).toBeInViewport();
    expect(
      await page.evaluate((): number => document.documentElement.scrollWidth),
    ).toBeLessThanOrEqual(width);
    await page.screenshot({
      path: test.info().outputPath(`immediate-clone-${width}.png`),
      fullPage: true,
    });
  });
}

test("unmatched replacement reports an actionable focused error and retains the selected brand without creating a draft", async ({
  api,
  page,
}): Promise<void> => {
  const { source, sourceItem } = await sourceFixture(api);
  await cloneQuery("UPDATE catalogue_items SET equipment_types=$2::jsonb WHERE id=$1", [
    sourceItem.id,
    JSON.stringify([CLONE_SCENARIOS.UNMATCHED_TYPE]),
  ]);
  await cloneQuery("UPDATE quotation_items SET equipment_type=$2 WHERE catalogue_item_id=$1", [
    sourceItem.id,
    CLONE_SCENARIOS.UNMATCHED_TYPE,
  ]);
  const beforeIds = await quotationIds(api);
  const before = await quotationDocument(await api.send(HTTP_METHODS.GET, quotePath(source.id)));
  await page.goto(`/quotations?cloneFrom=${source.id}`);
  await selectMuiOption(page, page.getByLabel("חברת מיזוג חדשה"), QUOTATION.OTHER_BRAND);
  await page.getByRole("button", { name: "צור הצעה חדשה", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText(sourceItem.sku);
  await expect(page.getByRole("alert").locator("..")).toBeFocused();
  await expect(page.getByLabel("חברת מיזוג חדשה")).toContainText(QUOTATION.OTHER_BRAND);
  expect(await quotationIds(api)).toEqual(beforeIds);
  expect(await quotationDocument(await api.send(HTTP_METHODS.GET, quotePath(source.id)))).toEqual(
    before,
  );
});

test("concurrent recommended commands commit one draft number and replay the same full detail after source and catalogue deletion", async ({
  api,
}): Promise<void> => {
  const { source, sourceItem } = await sourceFixture(api);
  const input = recommendedInput(source);
  const beforeIds = await quotationIds(api);
  const responses = await Promise.all(
    Array.from(
      { length: CLONE_SCENARIOS.CONCURRENT_REQUESTS },
      (): ReturnType<TGenAirApi["send"]> =>
        api.send(HTTP_METHODS.POST, recommendedPath(source.id), input),
    ),
  );
  expect(responses.map((response): number => response.status())).toEqual(
    Array.from({ length: CLONE_SCENARIOS.CONCURRENT_REQUESTS }, (): number => 201),
  );
  const copies = await Promise.all(
    responses.map((response): ReturnType<typeof quotationDocument> => quotationDocument(response)),
  );
  const copy = copies[0];
  if (!copy) {
    throw new Error("Missing concurrent clone result");
  }

  for (const result of copies) {
    expect(result).toEqual(copy);
  }
  expect((await quotationIds(api)).filter((id): boolean => !beforeIds.includes(id))).toEqual([
    copy.id,
  ]);
  expect(
    await taskQuotationQuery(
      "SELECT quotation_id FROM quotation_clone_commands WHERE actor_id=$1 AND idempotency_key=$2",
      [api.session.user.id, input.idempotencyKey],
    ),
  ).toEqual([{ quotation_id: copy.id }]);
  expect(
    await taskQuotationQuery("SELECT id FROM quotations WHERE number=$1", [copy.number]),
  ).toEqual([{ id: copy.id }]);
  await cloneQuery("UPDATE catalogue_items SET deleted_at=NOW(),price=999 WHERE id=$1", [
    sourceItem.id,
  ]);
  await cloneQuery("UPDATE quotations SET deleted_at=NOW(),version=version+1 WHERE id=$1", [
    source.id,
  ]);
  expect((await api.send(HTTP_METHODS.GET, quotePath(source.id))).status()).toBe(404);
  const replay = await api.send(HTTP_METHODS.POST, recommendedPath(source.id), input);
  expect(replay.status()).toBe(201);
  expect(await quotationDocument(replay)).toEqual(copy);
  expect(
    (
      await api.send(HTTP_METHODS.POST, recommendedPath(source.id), {
        ...input,
        targetBrand: QUOTATION.BRAND,
      })
    ).status(),
  ).toBe(409);
});

test("recommended validation rejects stale version missing and invalid targets without an orphan or source mutation", async ({
  api,
}): Promise<void> => {
  const { source } = await sourceFixture(api);
  const beforeIds = await quotationIds(api);
  const before = await quotationDocument(await api.send(HTTP_METHODS.GET, quotePath(source.id)));
  const input = recommendedInput(source);
  for (const scenario of [
    { input: { ...input, sourceVersion: source.version + 1 }, status: 409 },
    { input: { ...input, targetBrand: "" }, status: 400 },
    { input: { ...input, targetBrand: CLONE_SCENARIOS.INVALID_BRAND }, status: 400 },
    { input: { ...input, targetBrand: QUOTATION.BRAND }, status: 400 },
  ]) {
    expect(
      (await api.send(HTTP_METHODS.POST, recommendedPath(source.id), scenario.input)).status(),
    ).toBe(scenario.status);
    expect(await quotationIds(api)).toEqual(beforeIds);
    expect(
      await taskQuotationQuery(
        "SELECT quotation_id FROM quotation_clone_commands WHERE actor_id=$1 AND idempotency_key=$2",
        [api.session.user.id, input.idempotencyKey],
      ),
    ).toEqual([]);
    expect(await quotationDocument(await api.send(HTTP_METHODS.GET, quotePath(source.id)))).toEqual(
      before,
    );
  }
});

test("recommended replay rechecks current create permissions", async ({
  api,
  apiAs,
}): Promise<void> => {
  const { source } = await sourceFixture(api);
  const engineer = await apiAs(TEST_USERS[USER_ROLES.ENGINEER]);
  const input = recommendedInput(source);
  await withRolePermissions(
    USER_ROLES.ENGINEER,
    [PERMISSIONS.QUOTATIONS_READ, PERMISSIONS.QUOTATIONS_CREATE, PERMISSIONS.PROJECTS_READ],
    async (): Promise<void> => {
      const response = await engineer.send(HTTP_METHODS.POST, recommendedPath(source.id), input);
      expect(response.status()).toBe(201);
    },
  );
  await withRolePermissions(
    USER_ROLES.ENGINEER,
    [PERMISSIONS.QUOTATIONS_READ, PERMISSIONS.PROJECTS_READ],
    async (): Promise<void> => {
      expect(
        (await engineer.send(HTTP_METHODS.POST, recommendedPath(source.id), input)).status(),
      ).toBe(403);
    },
  );
});

test("recommended clone and clone of secondary derive task associations while preserving the original primary and current prices", async ({
  api,
}): Promise<void> => {
  const { source, sourceItem, replacement, project } = await sourceFixture(api);
  const task = await api.createTask({
    projectId: project.id,
    taskType: TASK_TYPES.QUOTATION,
    title: `Clone association ${randomUUID()}`,
    description: "QA disposable explicit task association",
  });
  await cloneQuery(
    "INSERT INTO task_quotation_links(task_id,quotation_id,is_primary) VALUES($1,$2,true)",
    [task.id, source.id],
  );
  await cloneQuery("UPDATE catalogue_items SET price=333 WHERE id=$1", [replacement.id]);
  const first = await quotationDocument(
    await api.send(HTTP_METHODS.POST, recommendedPath(source.id), recommendedInput(source)),
  );
  const sourceTarget = await createCatalogueFixture({
    brand: QUOTATION.BRAND,
    equipmentTypes: ["עילי"],
    capacityBtu: sourceItem.capacityBtu,
    sku: `AA-current-${randomUUID()}`,
    price: "444",
  });
  await cloneQuery("UPDATE catalogue_items SET deleted_at=NOW() WHERE id=$1", [sourceItem.id]);
  const second = await quotationDocument(
    await api.send(HTTP_METHODS.POST, recommendedPath(first.id), {
      ...recommendedInput(first),
      targetBrand: QUOTATION.BRAND,
    }),
  );
  expect(first.sections[0]?.items[0]?.catalogueItemId).toBe(replacement.id);
  expect(first.sections[0]?.items[0]?.quotedPrice).toBe("333.0000");
  expect(second.sections[0]?.items[0]?.catalogueItemId).toBe(sourceTarget.id);
  expect(second.sections[0]?.items[0]?.quotedPrice).toBe("444.0000");
  expect(second.projectId).toBe(source.projectId);
  expect(second.paymentTerms).toBe(source.paymentTerms);
  expect(second.sections[1]?.items[0]).toMatchObject({
    description: source.sections[1]?.items[0]?.description,
    quantity: source.sections[1]?.items[0]?.quantity,
    quotedPrice: source.sections[1]?.items[0]?.quotedPrice,
  });
  expect(
    await taskQuotationQuery(
      "SELECT quotation_id,is_primary FROM task_quotation_links WHERE task_id=$1 ORDER BY quotation_id",
      [task.id],
    ),
  ).toEqual(
    [
      { quotation_id: source.id, is_primary: true },
      { quotation_id: first.id, is_primary: false },
      { quotation_id: second.id, is_primary: false },
    ].sort((left, right): number => left.quotation_id.localeCompare(right.quotation_id)),
  );
});

for (const recovery of CLONE_SCENARIOS.RECOVERY_STATES) {
  test(`lost response survives real reload and recovers the frozen command when source becomes ${recovery}`, async ({
    api,
    page,
  }): Promise<void> => {
    const { source, sourceItem } = await sourceFixture(api);
    const inputs: unknown[] = [];
    const committed: IQuotationDocument[] = [];
    await page.route("**/clone-recommended", async (route): Promise<void> => {
      inputs.push(route.request().postDataJSON());
      const response = await route.fetch();
      expect(response.status()).toBe(201);
      const document = await quotationDocument(response);
      committed.push(document);
      if (inputs.length === 1) {
        await route.abort("connectionreset");
        return;
      }

      await route.fulfill({ response });
    });
    await page.goto(`/quotations?cloneFrom=${source.id}`);
    await selectMuiOption(page, page.getByLabel("חברת מיזוג חדשה"), QUOTATION.OTHER_BRAND);
    await page.getByRole("button", { name: "צור הצעה חדשה", exact: true }).click();
    await expect(page.getByRole("alert")).toContainText("לא התקבל אישור ליצירה");
    await cloneQuery("UPDATE catalogue_items SET deleted_at=NOW() WHERE id=$1", [sourceItem.id]);
    const statements: Record<typeof recovery, string> = {
      unavailable: "UPDATE quotations SET deleted_at=NOW(),version=version+1 WHERE id=$1",
      General: "UPDATE quotations SET brands='[]'::jsonb,brand='',version=version+1 WHERE id=$1",
      targetBrand:
        "UPDATE quotations SET brands='[\"תדיראן\"]'::jsonb,brand='תדיראן',version=version+1 WHERE id=$1",
    };
    await cloneQuery(statements[recovery], [source.id]);
    await page.reload();
    await expect(page.getByLabel("חברת מיזוג חדשה")).toContainText(QUOTATION.OTHER_BRAND);
    const recover = page.getByRole("button", { name: "בדוק תוצאת היצירה", exact: true });
    await expect(recover).toBeEnabled();
    await recover.click();
    await expect(page).toHaveURL(/\/quotations\/[\w-]+#quotation-detail-heading$/);
    expect(inputs).toHaveLength(2);
    expect(inputs[1]).toEqual(inputs[0]);
    expect(committed[1]).toEqual(committed[0]);
    expect(quotationIdFromPage(page)).toBe(committed[0]?.id);
  });
}

test("late committed clone response cannot navigate after the user changes route", async ({
  api,
  page,
}): Promise<void> => {
  const { source } = await sourceFixture(api);
  const observed = createDeferred();
  const release = createDeferred();
  const finished = createDeferred();
  await page.route("**/clone-recommended", async (route): Promise<void> => {
    const response = await route.fetch();
    expect(response.status()).toBe(201);
    observed.resolve();
    await release.promise;
    await route.fulfill({ response });
    finished.resolve();
  });
  await page.goto(`/quotations?cloneFrom=${source.id}`);
  await selectMuiOption(page, page.getByLabel("חברת מיזוג חדשה"), QUOTATION.OTHER_BRAND);
  await page.getByRole("button", { name: "צור הצעה חדשה", exact: true }).click();
  await observed.promise;
  await page.evaluate((): void => {
    history.pushState({}, "", "/quotations");
    dispatchEvent(new PopStateEvent("popstate"));
  });
  await expect(page).toHaveURL(/\/quotations$/);
  release.resolve();
  await finished.promise;
  await expect(page.getByRole("heading", { name: "הצעות מחיר", exact: true })).toBeVisible();
  await expect(page).toHaveURL(/\/quotations$/);
});

test("stale source asks for refresh before an explicit new creation intent", async ({
  api,
  page,
}): Promise<void> => {
  const { source } = await sourceFixture(api);
  const inputs: unknown[] = [];
  await page.route("**/clone-recommended", async (route): Promise<void> => {
    inputs.push(route.request().postDataJSON());
    await route.continue();
  });
  await page.goto(`/quotations?cloneFrom=${source.id}`);
  await selectMuiOption(page, page.getByLabel("חברת מיזוג חדשה"), QUOTATION.OTHER_BRAND);
  const updated = await saveQuotation(api, source.id, {
    ...quotationWrite(source),
    internalNotes: "Source changed externally",
  });
  await page.getByRole("button", { name: "צור הצעה חדשה", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("הצעת המקור השתנתה");
  await expect(page.getByRole("button", { name: "צור הצעה חדשה", exact: true })).toBeDisabled();
  await page.getByRole("button", { name: "רענן הצעת מקור", exact: true }).click();
  await page.getByRole("button", { name: "צור הצעה חדשה", exact: true }).click();
  await expect(page).toHaveURL(/\/quotations\/[\w-]+#quotation-detail-heading$/);
  expect(inputs).toHaveLength(2);
  const first = recordedCommand(inputs[0]);
  const refreshed = recordedCommand(inputs[1]);
  expect(first.sourceVersion).toBe(source.version);
  expect(refreshed.sourceVersion).toBe(updated.version);
  expect(first.idempotencyKey).toMatch(CLONE_SCENARIOS.COMMAND_KEY_PATTERN);
  expect(refreshed.idempotencyKey).toMatch(CLONE_SCENARIOS.COMMAND_KEY_PATTERN);
  expect(refreshed.idempotencyKey).not.toBe(first.idempotencyKey);
  expect(refreshed.targetBrand).toBe(first.targetBrand);
});

test("late committed clone response cannot navigate or expose result after logout", async ({
  api,
  page,
}): Promise<void> => {
  const { source } = await sourceFixture(api);
  const observed = createDeferred();
  const release = createDeferred();
  const finished = createDeferred();
  await page.route("**/clone-recommended", async (route): Promise<void> => {
    const response = await route.fetch();
    expect(response.status()).toBe(201);
    observed.resolve();
    await release.promise;
    await route.fulfill({ response });
    finished.resolve();
  });
  await page.goto(`/quotations?cloneFrom=${source.id}`);
  await selectMuiOption(page, page.getByLabel("חברת מיזוג חדשה"), QUOTATION.OTHER_BRAND);
  await page.getByRole("button", { name: "צור הצעה חדשה", exact: true }).click();
  await observed.promise;
  await createAppShell(page).logoutButton.click();
  await expect(createLoginPage(page).heading).toBeVisible();
  release.resolve();
  await finished.promise;
  await expect(createLoginPage(page).heading).toBeVisible();
  await expect(page).not.toHaveURL(/\/quotations\/[\w-]+/);
});
