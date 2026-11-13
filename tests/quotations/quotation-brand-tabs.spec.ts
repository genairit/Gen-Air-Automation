import {
  saveQuotation,
  quotationWrite,
  createQuotation,
  quotationDocument,
} from "../../src/api/quotation.api.ts";

import {
  createCatalogueFixture,
  setQuotationWarningScopeFixture,
} from "../../src/environment/quotation-fixtures.ts";

import { randomUUID } from "node:crypto";
import { seedCustomer } from "../../src/api/seed-data.ts";
import { test, expect } from "../../src/fixtures/test.fixture.ts";
import { HTTP_METHODS } from "../../src/constants/http.constant.ts";
import { QUOTATION } from "../../src/constants/quotation.constant.ts";
import { PAYMENT_TERMS } from "../../src/constants/domain.constant.ts";
import { createQuotationPage } from "../../src/pages/quotation.page.ts";

const getQuote = async (api: Parameters<typeof createQuotation>[0], id: string) =>
  quotationDocument(await api.send(HTTP_METHODS.GET, `/quotation/${id}`));
const line = (catalogueItemId: string, circuit: string | null = null) => ({
  id: randomUUID(),
  catalogueItemId,
  parentItemId: null,
  description: "Quoted snapshot",
  quotedPrice: "10.0050",
  quantity: "1",
  location: "",
  circuit,
  requestedCapacityBtu: null,
});

test("brand and General tabs keep separate catalogue rows, snapshots, quantities and one total through review", async ({
  api,
  page,
}) => {
  const electra = await createCatalogueFixture({ price: "100", description: "Electra fixture" });
  const tadiran = await createCatalogueFixture({
    price: "200",
    brand: QUOTATION.OTHER_BRAND,
    description: "Tadiran fixture",
  });
  const general = await createCatalogueFixture({
    price: "30",
    brand: "",
    systemType: QUOTATION.SYSTEM.GENERAL,
    equipmentRole: QUOTATION.ROLE.OTHER,
    description: "General fixture",
  });
  const initial = await createQuotation(api, (await seedCustomer(api)).id);
  const quote = createQuotationPage(page);
  await quote.goto(initial.id);

  await expect(page.getByRole("tablist", { name: "לשוניות חברות ופריטים כלליים" })).toBeVisible();
  await expect(page.getByRole("tab", { name: "כללי" })).toBeVisible();
  await expect(page.getByRole("tab", { name: QUOTATION.BRAND })).toHaveCount(0);
  await expect(page.getByRole("tab", { name: QUOTATION.OTHER_BRAND })).toHaveCount(0);

  await quote.addBrandTab(QUOTATION.BRAND);
  await quote.saved(() => quote.button("+ סינגלים").click());
  await quote.field("כמות להוספה").fill("2");
  await Promise.all([
    page.waitForResponse(response => response.url().includes(encodeURIComponent(tadiran.sku))),
    quote.field("חיפוש פריט בקטלוג").fill(tadiran.sku),
  ]);
  await expect(page.getByRole("button").filter({ hasText: tadiran.sku })).toHaveCount(0);
  await quote.add(electra.sku);
  await quote.fill("מיקום", "Electra room");

  await quote.addBrandTab(QUOTATION.OTHER_BRAND);
  await expect(quote.field("מיקום")).toHaveCount(0);
  await quote.saved(() => quote.button("+ סינגלים").click());
  await quote.add(tadiran.sku);
  await quote.fill("מיקום", "Tadiran room");
  await page.getByRole("tab", { name: "כללי" }).click();
  await expect(quote.field("מיקום")).toHaveCount(0);
  await quote.saved(() => quote.button("+ פריטים נוספים").click());
  await Promise.all([
    page.waitForResponse(response => response.url().includes(encodeURIComponent(electra.sku))),
    quote.field("חיפוש פריט בקטלוג").fill(electra.sku),
  ]);
  await expect(page.getByRole("button").filter({ hasText: electra.sku })).toHaveCount(0);
  await quote.add(general.sku);
  await quote.fill("מיקום", "Shared room");
  await expect(quote.amount("סכום השורות")).toHaveText(/430\.00/);

  await page.getByRole("tab", { name: QUOTATION.BRAND }).click();
  await expect(quote.field("מיקום")).toHaveValue("Electra room");
  await page.getByRole("tab", { name: QUOTATION.OTHER_BRAND }).click();
  await expect(quote.field("מיקום")).toHaveValue("Tadiran room");
  await page.reload();
  await expect(page.getByRole("tab", { name: QUOTATION.BRAND })).toBeVisible();
  await expect(page.getByRole("tab", { name: QUOTATION.OTHER_BRAND })).toBeVisible();
  await expect(quote.field("מיקום")).toHaveValue("Electra room");
  await page.getByRole("tab", { name: QUOTATION.OTHER_BRAND }).click();
  await expect(quote.field("מיקום")).toHaveValue("Tadiran room");
  await page.getByRole("tab", { name: "כללי" }).click();
  await expect(quote.field("מיקום")).toHaveValue("Shared room");

  const saved = await getQuote(api, initial.id);
  expect(saved.brands).toEqual([QUOTATION.BRAND, QUOTATION.OTHER_BRAND]);
  expect(saved.sections.map(section => section.brand)).toEqual([
    QUOTATION.BRAND,
    QUOTATION.OTHER_BRAND,
    null,
  ]);
  expect(saved.sections.map(section => section.items[0]?.catalogueItemId)).toEqual([
    electra.id,
    tadiran.id,
    general.id,
  ]);
  expect(saved.sections.map(section => section.items[0]?.location)).toEqual([
    "Electra room",
    "Tadiran room",
    "Shared room",
  ]);
  expect(saved.sections[0]?.items[0]?.quantity).toBe("2.0000");
  expect(saved.sections.map(section => section.items[0]?.quotedPrice)).toEqual([
    "100.0000",
    "200.0000",
    "30.0000",
  ]);
  expect(saved.totals.subtotal).toBe("430.00");

  await quote.transition("סיימתי, לבדיקה");
  await expect(page.getByRole("cell", { name: electra.sku, exact: true })).toHaveCount(1);
  await expect(page.getByRole("cell", { name: tadiran.sku, exact: true })).toHaveCount(1);
  await expect(page.getByRole("cell", { name: general.sku, exact: true })).toHaveCount(1);
  await expect(page.getByRole("columnheader", { name: /אלקטרה/ })).toBeVisible();
  await expect(page.getByRole("columnheader", { name: /תדיראן/ })).toBeVisible();
  await expect(page.getByRole("columnheader", { name: /כללי/ })).toBeVisible();
  await expect(quote.amount("סכום השורות")).toHaveText(/430\.00/);
});

test("API rejects cross-brand and branded-General selections while retaining legacy one-brand saves", async ({
  api,
}) => {
  const electra = await createCatalogueFixture();
  const tadiran = await createCatalogueFixture({ brand: QUOTATION.OTHER_BRAND });
  const general = await createCatalogueFixture({
    brand: "",
    systemType: QUOTATION.SYSTEM.GENERAL,
    equipmentRole: QUOTATION.ROLE.OTHER,
  });
  const initial = await createQuotation(api, (await seedCustomer(api)).id);
  const section = (brand: string | null, catalogueItemId: string) => ({
    id: randomUUID(),
    title: "Room",
    brand,
    systemType: brand === null ? QUOTATION.SYSTEM.GENERAL : QUOTATION.SYSTEM.SINGLE,
    items: [line(catalogueItemId)],
  });
  const base = { ...quotationWrite(initial), brand: QUOTATION.BRAND, brands: [QUOTATION.BRAND] };
  for (const invalid of [
    section(QUOTATION.BRAND, tadiran.id),
    section(null, electra.id),
    section(QUOTATION.OTHER_BRAND, tadiran.id),
  ]) {
    const response = await api.send(HTTP_METHODS.PUT, `/quotation/${initial.id}`, {
      ...base,
      sections: [invalid],
    });
    expect(response.status()).toBe(400);
  }
  const legacy = await saveQuotation(api, initial.id, {
    ...quotationWrite(initial),
    brand: QUOTATION.BRAND,
    sections: [
      {
        id: randomUUID(),
        title: "Room",
        systemType: QUOTATION.SYSTEM.SINGLE,
        items: [line(electra.id)],
      },
    ],
  });
  expect(legacy.brands).toEqual([QUOTATION.BRAND]);
  expect(legacy.sections[0]?.brand).toBe(QUOTATION.BRAND);
  const multi = await saveQuotation(api, initial.id, {
    ...quotationWrite(legacy),
    brands: [QUOTATION.BRAND, QUOTATION.OTHER_BRAND],
    sections: [
      section(QUOTATION.BRAND, electra.id),
      section(QUOTATION.OTHER_BRAND, tadiran.id),
      section(null, general.id),
    ],
  });
  expect(multi.totals.subtotal).toBe("30.03");
  const staleClient = quotationWrite(multi);
  delete staleClient.brands;
  expect((await api.send(HTTP_METHODS.PUT, `/quotation/${initial.id}`, staleClient)).status()).toBe(
    409,
  );
  expect((await getQuote(api, initial.id)).sections).toHaveLength(3);
});

test("VRF circuit warnings are separate for each brand and system even when circuit names match", async ({
  api,
  page,
}) => {
  const electraIndoor = await createCatalogueFixture({
    systemType: QUOTATION.SYSTEM.VRF,
    equipmentRole: QUOTATION.ROLE.INDOOR,
  });
  const tadiranIndoor = await createCatalogueFixture({
    brand: QUOTATION.OTHER_BRAND,
    systemType: QUOTATION.SYSTEM.VRF,
    equipmentRole: QUOTATION.ROLE.INDOOR,
  });
  const initial = await createQuotation(api, (await seedCustomer(api)).id);
  const saved = await saveQuotation(api, initial.id, {
    ...quotationWrite(initial),
    brand: QUOTATION.BRAND,
    brands: [QUOTATION.BRAND, QUOTATION.OTHER_BRAND],
    sections: [
      {
        id: randomUUID(),
        title: "First floor",
        brand: QUOTATION.BRAND,
        systemType: QUOTATION.SYSTEM.VRF,
        items: [line(electraIndoor.id, "A")],
      },
      {
        id: randomUUID(),
        title: "Second floor",
        brand: QUOTATION.BRAND,
        systemType: QUOTATION.SYSTEM.VRF,
        items: [line(electraIndoor.id, "A")],
      },
      {
        id: randomUUID(),
        title: "Third floor",
        brand: QUOTATION.OTHER_BRAND,
        systemType: QUOTATION.SYSTEM.VRF,
        items: [line(tadiranIndoor.id, "A")],
      },
    ],
  });
  expect(saved.warningScopeVersion).toBe(2);
  const circuitWarnings = saved.warnings.filter(warning =>
    warning.text.includes("יחידות פנימיות בלי מעבה"),
  );
  expect(circuitWarnings).toHaveLength(3);
  expect(new Set(circuitWarnings.map(warning => warning.key)).size).toBe(3);
  const quote = createQuotationPage(page);
  await quote.goto(initial.id);
  await quote.transition("סיימתי, לבדיקה");
  for (const name of [
    "אלקטרה · First floor 1 · A",
    "אלקטרה · Second floor 2 · A",
    "תדיראן · Third floor 3 · A",
  ]) {
    await expect(page.getByRole("checkbox", { name: new RegExp(name) })).toBeVisible();
  }
});

test("legacy single-brand warning scope and acknowledgements remain valid after approval", async ({
  api,
  page,
}) => {
  const indoor = await createCatalogueFixture({
    systemType: QUOTATION.SYSTEM.VRF,
    equipmentRole: QUOTATION.ROLE.INDOOR,
  });
  const initial = await createQuotation(api, (await seedCustomer(api)).id);
  await saveQuotation(api, initial.id, {
    ...quotationWrite(initial),
    brand: QUOTATION.BRAND,
    paymentTerms: PAYMENT_TERMS.PREPAID,
    sections: [
      {
        id: randomUUID(),
        title: "Legacy floor",
        systemType: QUOTATION.SYSTEM.VRF,
        items: [line(indoor.id, "A")],
      },
    ],
  });
  await setQuotationWarningScopeFixture(initial.id, 1);
  const quote = createQuotationPage(page);
  await quote.goto(initial.id);
  await expect(page.getByRole("tab", { name: QUOTATION.BRAND })).toBeVisible();
  await expect(page.getByRole("tab", { name: "כללי" })).toBeVisible();
  await quote.transition("סיימתי, לבדיקה");
  await expect(
    page.getByRole("checkbox", { name: /מעגל A: יש יחידות פנימיות בלי מעבה/ }),
  ).toBeVisible();
  await quote.acknowledge();
  await quote.transition("אישור ההצעה");
  await page.reload();
  const approved = await getQuote(api, initial.id);
  expect(approved.status).toBe(QUOTATION.STATUS.APPROVED);
  expect(approved.warningScopeVersion).toBe(1);
  expect(approved.warnings.every(warning => warning.acknowledged)).toBe(true);
  await expect(
    page.getByRole("checkbox", { name: /מעגל A: יש יחידות פנימיות בלי מעבה/ }),
  ).toBeChecked();
});
