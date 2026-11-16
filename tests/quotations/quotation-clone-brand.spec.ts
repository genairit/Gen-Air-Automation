import {
  saveQuotation,
  quotationPage,
  quotationWrite,
  createQuotation,
  quotationDocument,
} from "../../src/api/quotation.api.ts";

import { randomUUID } from "node:crypto";
import type { Page } from "@playwright/test";
import type { TGenAirApi } from "../../src/api/gen-air-api.ts";
import { test, expect } from "../../src/fixtures/test.fixture.ts";
import { HTTP_METHODS } from "../../src/constants/http.constant.ts";
import { QUOTATION } from "../../src/constants/quotation.constant.ts";
import { PAYMENT_TERMS } from "../../src/constants/domain.constant.ts";
import { USER_ROLES } from "../../src/constants/user-role.constant.ts";
import { TEST_USERS } from "../../src/constants/test-users.constant.ts";
import { createQuotationPage } from "../../src/pages/quotation.page.ts";
import { createDeferred } from "../../src/utilities/deferred.utility.ts";
import { PERMISSIONS } from "../../src/constants/permission.constant.ts";
import { selectMuiOption } from "../../src/pages/mui-select.component.ts";
import { withRolePermissions } from "../../src/environment/role-permissions.ts";
import { createCatalogueFixture } from "../../src/environment/quotation-fixtures.ts";
import type { IQuotationDocument } from "../../src/interfaces/quotation.interface.ts";
import { createTestDatabaseClient } from "../../src/environment/test-database-client.ts";
import { seedApartment, seedBuilding, seedCustomer, seedUser } from "../../src/api/seed-data.ts";

const quotePath = (id: string) => `/quotation/${id}`;
const clonePath = (id: string) => `${quotePath(id)}/clone`;
const firstBrandLine = (quotation: IQuotationDocument) => {
  const item = quotation.sections.find(section => section.brand === QUOTATION.BRAND)?.items[0];
  if (!item) throw new Error(`Missing source brand line in quotation ${quotation.id}`);
  return item;
};
const quotationIdFromPage = (page: Page): string => {
  const match = new URL(page.url()).pathname.match(/^\/quotations\/([0-9a-f-]{36})$/i);
  if (!match?.[1]) throw new Error(`Expected quotation detail URL, received ${page.url()}`);
  return match[1];
};
const quotationIds = async (api: TGenAirApi): Promise<string[]> => {
  const collect = async (cursor: string | null, ids: string[]): Promise<string[]> => {
    const path = `/quotation?batchSize=50${cursor ? `&batchCursor=${encodeURIComponent(cursor)}` : ""}`;
    const page = await quotationPage(await api.send(HTTP_METHODS.GET, path));
    const nextIds = [...ids, ...page.items.map(quotation => quotation.id)];
    return page.nextCursor ? collect(page.nextCursor, nextIds) : nextIds.sort();
  };
  return collect(null, []);
};
const line = (catalogueItemId: string, description: string, quantity = "1") => ({
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
const sourceFixture = async (api: TGenAirApi) => {
  const customer = await seedCustomer(api);
  const project = await seedBuilding(api, customer);
  const salesAgent = await seedUser(api, USER_ROLES.ENGINEER);
  const sourceItem = await createCatalogueFixture({
    description: "Source unit",
    price: "111",
    equipmentTypes: ["עילי"],
  });
  const replacement = await createCatalogueFixture({
    brand: QUOTATION.OTHER_BRAND,
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
const cloneInput = (source: IQuotationDocument, targetId: string) => ({
  sourceVersion: source.version,
  targetBrand: QUOTATION.OTHER_BRAND,
  mappings: [{ sourceLineId: firstBrandLine(source).id, targetCatalogueItemId: targetId }],
});

test("API clone creates a separate draft, preserves General snapshots and project context, and leaves source unchanged", async ({
  api,
}) => {
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
  expect(copy.sections.map(section => section.brand)).toEqual([QUOTATION.OTHER_BRAND, null]);
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

test("clone creation page requires explicit review of compatible target-brand suggestions", async ({
  api,
  page,
}) => {
  const { source, sourceItem, replacement, wrongRole, wrongType, wrongSystem, zeroCapacity } =
    await sourceFixture(api);
  const editor = createQuotationPage(page);
  await editor.goto(source.id);
  await expect(editor.button("צור העתק לחברה אחרת")).toBeVisible();
  await expect(page.getByLabel("חברת מיזוג")).toBeVisible();
  await editor.button("צור העתק לחברה אחרת").click();
  await expect(page).toHaveURL(new RegExp(`cloneFrom=${source.id}`));
  await expect(
    page.getByRole("heading", { name: new RegExp("יצירת העתק לחברת מיזוג אחרת") }),
  ).toBeVisible();
  const create = page.getByRole("button", { name: "צור הצעה חדשה" });
  await expect(create).toBeDisabled();
  await selectMuiOption(page, page.getByLabel("חברת מיזוג חדשה"), QUOTATION.OTHER_BRAND);
  const choice = page.getByLabel(`חלופה עבור ${sourceItem.sku}`, { exact: true });
  await choice.click();
  await expect(page.getByRole("option").filter({ hasText: replacement.sku })).toHaveCount(1);
  await expect(page.getByRole("option").filter({ hasText: wrongRole.sku })).toHaveCount(0);
  await expect(page.getByRole("option").filter({ hasText: wrongType.sku })).toHaveCount(0);
  await expect(page.getByRole("option").filter({ hasText: wrongSystem.sku })).toHaveCount(0);
  await expect(page.getByRole("option").filter({ hasText: zeroCapacity.sku })).toHaveCount(0);
  await page.keyboard.press("Escape");
  await expect(create).toBeDisabled();
  await expect(page.getByText("1 שורות ממתינות לבחירת חלופה")).toBeVisible();
  await expect(page.getByRole("button", { name: "אשר חלופה מוצעת" })).toBeVisible();
  await selectMuiOption(page, choice, replacement.id);
  await expect(choice).toContainText(replacement.sku);
  await expect(create).toBeEnabled();
  await create.click();
  await expect(page).toHaveURL(/\/quotations\/[\w-]+$/);
  await expect(page.getByRole("heading", { name: source.number })).toHaveCount(0);
  const copy = await quotationDocument(
    await api.send(HTTP_METHODS.GET, quotePath(quotationIdFromPage(page))),
  );
  expect(copy.brands).toEqual([QUOTATION.OTHER_BRAND]);
  expect(copy.sections[1]?.items[0]?.description).toBe(source.sections[1]?.items[0]?.description);
  expect(
    (await quotationDocument(await api.send(HTTP_METHODS.GET, quotePath(source.id)))).brands,
  ).toEqual([QUOTATION.BRAND]);
});

test("clone creation remains disabled until every branded line has a reviewed replacement", async ({
  api,
  page,
}) => {
  const { source, sourceItem, replacement } = await sourceFixture(api);
  const secondItem = await createCatalogueFixture({ equipmentTypes: ["עילי"] });
  const write = quotationWrite(source);
  const firstSection = write.sections[0];
  if (!firstSection) throw new Error(`Missing source section in quotation ${source.id}`);
  firstSection.items.push(line(secondItem.id, "Second brand line"));
  const updated = await saveQuotation(api, source.id, write);
  await page.goto(`/quotations?cloneFrom=${updated.id}`);
  await selectMuiOption(page, page.getByLabel("חברת מיזוג חדשה"), QUOTATION.OTHER_BRAND);
  const create = page.getByRole("button", { name: "צור הצעה חדשה" });
  await expect(page.getByText("2 שורות ממתינות לבחירת חלופה")).toBeVisible();
  await expect(create).toBeDisabled();
  await selectMuiOption(
    page,
    page.getByLabel(`חלופה עבור ${sourceItem.sku}`, { exact: true }),
    replacement.id,
  );
  await expect(page.getByText("1 שורות ממתינות לבחירת חלופה")).toBeVisible();
  await expect(create).toBeDisabled();
  await selectMuiOption(
    page,
    page.getByLabel(`חלופה עבור ${secondItem.sku}`, { exact: true }),
    replacement.id,
  );
  await expect(page.getByText("0 שורות ממתינות לבחירת חלופה")).toBeVisible();
  await expect(create).toBeEnabled();
});

test("target-brand suggestions rank previously used compatible items ahead of unused peers", async ({
  api,
  page,
}) => {
  const { source, sourceItem, customer } = await sourceFixture(api);
  const searchToken = `RANK-${randomUUID()}`;
  const used = await createCatalogueFixture({
    brand: QUOTATION.OTHER_BRAND,
    equipmentTypes: ["עילי"],
    description: `${searchToken} used`,
  });
  const unused = await createCatalogueFixture({
    brand: QUOTATION.OTHER_BRAND,
    equipmentTypes: ["עילי"],
    description: `${searchToken} unused`,
  });
  const initial = await createQuotation(api, customer.id);
  await saveQuotation(api, initial.id, {
    ...quotationWrite(initial),
    brand: QUOTATION.OTHER_BRAND,
    sections: [
      {
        id: randomUUID(),
        title: "Usage seed",
        systemType: QUOTATION.SYSTEM.SINGLE,
        brand: QUOTATION.OTHER_BRAND,
        items: [line(used.id, "Used by current user")],
      },
    ],
  });
  await page.goto(`/quotations?cloneFrom=${source.id}`);
  await selectMuiOption(page, page.getByLabel("חברת מיזוג חדשה"), QUOTATION.OTHER_BRAND);
  await page.getByLabel(`חיפוש חלופה עבור ${sourceItem.sku}`, { exact: true }).fill(searchToken);
  const choice = page.getByLabel(`חלופה עבור ${sourceItem.sku}`, { exact: true });
  await choice.click();
  await expect(page.getByRole("option").filter({ hasText: used.sku })).toHaveCount(1);
  await expect(page.getByRole("option").filter({ hasText: unused.sku })).toHaveCount(1);
  await expect(page.getByRole("option").nth(1)).toContainText(used.sku);
  await page.keyboard.press("Escape");
});

test("cloning an approved building quotation keeps apartment links while resetting approval", async ({
  api,
}) => {
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
      warningKeys: review.warnings.map(warning => warning.key),
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
  expect(detail.apartmentLinks.map(link => link.apartmentId)).toEqual([apartment.id]);
  expect(
    (await quotationDocument(await api.send(HTTP_METHODS.GET, quotePath(source.id)))).status,
  ).toBe(QUOTATION.STATUS.APPROVED);
});

test("clone copies staged payment terms and requires a reviewed replacement for a retired source item", async ({
  api,
  page,
}) => {
  const { source, sourceItem, replacement } = await sourceFixture(api);
  const staged = await saveQuotation(api, source.id, {
    ...quotationWrite(source),
    paymentTerms: null,
    paymentSchedule: [{ percent: "100", text: "Before delivery" }],
  });
  const database = createTestDatabaseClient();
  await database.connect();
  try {
    await database.query("UPDATE catalogue_items SET deleted_at=NOW() WHERE id=$1", [
      sourceItem.id,
    ]);
  } finally {
    await database.end();
  }
  expect((await api.send(HTTP_METHODS.GET, `/catalogue-item/${sourceItem.id}`)).status()).toBe(404);
  await page.goto(`/quotations?cloneFrom=${staged.id}`);
  await expect(page.getByText("חלק מפריטי המקור כבר אינם זמינים בקטלוג")).toBeVisible();
  await selectMuiOption(page, page.getByLabel("חברת מיזוג חדשה"), QUOTATION.OTHER_BRAND);
  const choice = page.getByLabel(`חלופה עבור ${sourceItem.sku}`, { exact: true });
  await choice.click();
  await expect(page.getByRole("option").filter({ hasText: replacement.sku })).toHaveCount(1);
  await page.keyboard.press("Escape");
  await expect(page.getByRole("button", { name: "צור הצעה חדשה" })).toBeDisabled();
  await selectMuiOption(page, choice, replacement.id);
  await page.getByRole("button", { name: "צור הצעה חדשה" }).click();
  await expect(page).toHaveURL(/\/quotations\/[\w-]+$/);
  const copy = await quotationDocument(
    await api.send(HTTP_METHODS.GET, quotePath(quotationIdFromPage(page))),
  );
  expect(copy.paymentTerms).toBeNull();
  expect(copy.paymentSchedule).toEqual(staged.paymentSchedule);
  expect(copy.sections[0]?.items[0]?.catalogueItemId).toBe(replacement.id);
});

test("multi-brand source hides clone action, direct clone page rejects, and API rejects", async ({
  api,
  page,
}) => {
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
}) => {
  const { source, replacement } = await sourceFixture(api);
  await withRolePermissions(
    USER_ROLES.ENGINEER,
    [PERMISSIONS.QUOTATIONS_READ, PERMISSIONS.PROJECTS_READ],
    async () => {
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
}) => {
  const { source, wrongRole, wrongType, wrongSystem, zeroCapacity, replacement } =
    await sourceFixture(api);
  const base = cloneInput(source, replacement.id);
  const mapping = base.mappings[0];
  if (!mapping) throw new Error(`Missing clone mapping for quotation ${source.id}`);
  const withTarget = (targetCatalogueItemId: string) => ({
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

for (const width of [1440, 900, 390]) {
  test(`clone replacement cards align long product details and actions at ${width}px`, async ({
    api,
    page,
  }) => {
    const { source, sourceItem } = await sourceFixture(api);
    const secondItem = await createCatalogueFixture({ equipmentTypes: ["עילי"] });
    const write = quotationWrite(source);
    const section = write.sections[0];
    if (!section) {
      throw new Error("Missing source quotation section");
    }

    section.items.push(
      line(
        secondItem.id,
        "יחידת מיזוג אוויר נסתרת עם מפרט התקנה מורחב, התאמה לתקרת גבס וחיבורי בקרה לפרויקט מסחרי גדול. הערות נוספות על מיקום היחידה, גישה לתחזוקה והתקנת התרמוסטט בחדר ההנדסה.",
      ),
    );
    const updated = await saveQuotation(api, source.id, write);
    await page.setViewportSize({ width, height: 1000 });
    await page.goto(`/quotations?cloneFrom=${updated.id}`);
    await selectMuiOption(page, page.getByLabel("חברת מיזוג חדשה"), QUOTATION.OTHER_BRAND);
    const cards = page.getByRole("region", { name: /^חלופה לפריט / });
    await expect(cards).toHaveCount(2);
    const first = page.getByRole("region", { name: `חלופה לפריט ${sourceItem.sku}`, exact: true });
    const second = page.getByRole("region", { name: `חלופה לפריט ${secondItem.sku}`, exact: true });
    for (const card of [first, second]) {
      await expect(card.getByRole("button", { name: "אשר חלופה מוצעת" })).toBeVisible();
      await expect(card).toHaveCSS("border-radius", "22px");
      await expect(card).toHaveCSS("direction", "rtl");
      const dimensions = await card.evaluate(element => ({
        width: element.clientWidth,
        contentWidth: element.scrollWidth,
      }));
      expect(dimensions.contentWidth).toBeLessThanOrEqual(dimensions.width);
      await expect(card.getByText("₪222.00", { exact: true })).toBeVisible();
    }

    const firstSearch = await first.getByRole("searchbox").boundingBox();
    const secondSearch = await second.getByRole("searchbox").boundingBox();
    const firstAction = await first.getByRole("button").boundingBox();
    const secondAction = await second.getByRole("button").boundingBox();
    const firstCard = await first.boundingBox();
    const secondCard = await second.boundingBox();
    if (
      !firstSearch ||
      !secondSearch ||
      !firstAction ||
      !secondAction ||
      !firstCard ||
      !secondCard
    ) {
      throw new Error("Replacement cards must have visible fields and actions");
    }

    if (Math.abs(firstCard.y - secondCard.y) < 2) {
      expect(Math.abs(firstSearch.y - secondSearch.y)).toBeLessThanOrEqual(2);
      expect(Math.abs(firstAction.y - secondAction.y)).toBeLessThanOrEqual(2);
    }
    expect(firstAction.width).toBeGreaterThan(firstCard.width - 40);
    expect(secondAction.width).toBeGreaterThan(secondCard.width - 40);
    const documentWidth = await page.evaluate(() => document.documentElement.scrollWidth);
    expect(documentWidth).toBeLessThanOrEqual(width);
    await page.screenshot({
      path: test.info().outputPath(`clone-replacement-cards-${width}.png`),
      fullPage: true,
    });
    await first.getByRole("button", { name: "אשר חלופה מוצעת" }).click();
    await expect(first.getByRole("status")).toContainText("נבחרה חלופה:");
    await expect(first.getByRole("button", { name: "אשר חלופה מוצעת" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "צור הצעה חדשה" })).toBeDisabled();
  });
}

test("clone replacement feedback distinguishes pending, no match and request errors", async ({
  api,
  page,
}) => {
  const { source, sourceItem } = await sourceFixture(api);
  await page.goto(`/quotations?cloneFrom=${source.id}`);
  await selectMuiOption(page, page.getByLabel("חברת מיזוג חדשה"), QUOTATION.OTHER_BRAND);
  const card = page.getByRole("region", { name: `חלופה לפריט ${sourceItem.sku}`, exact: true });
  await expect(card.getByRole("button", { name: "אשר חלופה מוצעת" })).toBeVisible();
  const search = card.getByRole("searchbox");
  const blocked = createDeferred();
  const observed = createDeferred();
  await page.route("**/catalogue-item?**", async route => {
    const query = new URL(route.request().url()).searchParams.get("search");
    if (query === "QA-pending-empty") {
      observed.resolve();
      await blocked.promise;
      await route.fulfill({ json: [] });
      return;
    }
    if (query === "QA-request-error") {
      await route.fulfill({ status: 500, json: { message: "QA catalogue unavailable" } });
      return;
    }

    await route.continue();
  });
  await search.fill("QA-pending-empty");
  await observed.promise;
  await expect(card.getByRole("status")).toHaveText("מחפש חלופות...");
  blocked.resolve();
  await expect(card.getByRole("status")).toContainText("לא נמצאה חלופה תואמת");
  await expect(card.getByRole("button", { name: "אשר חלופה מוצעת" })).toHaveCount(0);
  await search.fill("QA-request-error");
  await expect(card.getByRole("alert")).toContainText("QA catalogue unavailable");
  await expect(page.getByRole("button", { name: "צור הצעה חדשה" })).toBeDisabled();
  await expect(card.getByRole("button", { name: "אשר חלופה מוצעת" })).toHaveCount(0);
});
