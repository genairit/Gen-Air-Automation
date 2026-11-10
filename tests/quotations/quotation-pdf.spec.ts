import {
  createCatalogueFixture,
  setQuotationCountFixture,
} from "../../src/environment/quotation-fixtures.ts";

import { join } from "node:path";
import { randomUUID, createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { test, expect } from "../../src/fixtures/test.fixture.ts";
import { HTTP_METHODS } from "../../src/constants/http.constant.ts";
import { QUOTATION } from "../../src/constants/quotation.constant.ts";
import { USER_ROLES } from "../../src/constants/user-role.constant.ts";
import { TEST_USERS } from "../../src/constants/test-users.constant.ts";
import { createQuotationPage } from "../../src/pages/quotation.page.ts";
import { PERMISSIONS } from "../../src/constants/permission.constant.ts";
import { withRolePermissions } from "../../src/environment/role-permissions.ts";
import { seedCustomer, seedStandaloneProject } from "../../src/api/seed-data.ts";
import { AUTOMATION_DIRECTORIES } from "../../src/constants/environment.constant.ts";
import { saveQuotation, quotationWrite, createQuotation } from "../../src/api/quotation.api.ts";

const uploadsPath = join(AUTOMATION_DIRECTORIES.DATABASE, "fake-drive", "uploads.jsonl");

const uploads = async (): Promise<
  { name: string; parentId: string; mimeType: string; bytes: number; sha256: string }[]
> => {
  const contents = await readFile(uploadsPath, "utf8").catch(error => {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return "";
    }
    throw error;
  });
  return contents
    .trim()
    .split("\n")
    .filter(Boolean)
    .map(line => JSON.parse(line));
};

const pdfPages = async (bytes: Buffer): Promise<string[]> => {
  const document = await getDocument({ data: new Uint8Array(bytes) }).promise;
  const pages = await Promise.all(
    Array.from({ length: document.numPages }, async (_, index) => {
      const content = await (await document.getPage(index + 1)).getTextContent();
      return content.items.map(item => ("str" in item ? item.str : "")).join(" ");
    }),
  );
  return pages;
};

const pdfText = async (bytes: Buffer): Promise<string> => (await pdfPages(bytes)).join(" ");

const line = (item: Awaited<ReturnType<typeof createCatalogueFixture>>, quantity = "1") => ({
  id: randomUUID(),
  catalogueItemId: item.id,
  parentItemId: null,
  description: item.description,
  quotedPrice: item.price,
  quantity,
  location: "סלון",
  circuit: null,
  requestedCapacityBtu: item.capacityBtu,
});

test("unlinked preview and download use saved quotation data; linking saves only the next export in project quotations folder", async ({
  api,
  page,
}, testInfo) => {
  const customer = await seedCustomer(api);
  const item = await createCatalogueFixture({
    sku: `QA-PDF-${randomUUID()}`,
    description: "יחידת בדיקה QA PDF",
  });
  const secondBrand = await createCatalogueFixture({
    sku: `QA-SECOND-${randomUUID()}`,
    brand: QUOTATION.OTHER_BRAND,
    description: "Second brand unit",
  });
  const service = await createCatalogueFixture({
    sku: `QA-SERVICE-${randomUUID()}`,
    brand: "",
    systemType: QUOTATION.SYSTEM.GENERAL,
    equipmentRole: QUOTATION.ROLE.OTHER,
    description: "Service line without BTU",
    capacityBtu: null,
  });
  const initial = await createQuotation(api, customer.id);
  const quote = await saveQuotation(api, initial.id, {
    ...quotationWrite(initial),
    brand: QUOTATION.BRAND,
    brands: [QUOTATION.BRAND, QUOTATION.OTHER_BRAND],
    internalNotes: "PRIVATE QA PDF NOTE",
    sections: [
      {
        id: randomUUID(),
        title: "מערכת ראשונה",
        brand: QUOTATION.BRAND,
        systemType: QUOTATION.SYSTEM.SINGLE,
        items: [line(item, "2")],
      },
      {
        id: randomUUID(),
        title: "מערכת שנייה",
        brand: QUOTATION.OTHER_BRAND,
        systemType: QUOTATION.SYSTEM.SINGLE,
        items: [line(secondBrand)],
      },
      {
        id: randomUUID(),
        title: "עבודה כללית",
        brand: null,
        systemType: QUOTATION.SYSTEM.GENERAL,
        items: [line(service)],
      },
    ],
  });
  const editor = createQuotationPage(page);
  await editor.goto(quote.id);
  const before = await uploads();
  const response = page.waitForResponse(
    candidate =>
      candidate.url().endsWith(`/quotation/${quote.id}/pdf`) &&
      candidate.request().method() === HTTP_METHODS.POST,
  );
  await editor.button("ייצוא PDF").click();
  const previewResponse = await response;
  expect(previewResponse.status()).toBe(200);
  expect(previewResponse.headers()["content-type"]).toContain("application/pdf");
  const previewBytes = await previewResponse.body();
  await writeFile(testInfo.outputPath("quotation-unlinked.pdf"), previewBytes);
  expect(previewBytes.subarray(0, 5).toString()).toBe("%PDF-");
  await expect(page.getByTitle("תצוגה מקדימה של PDF")).toBeVisible();
  const pages = await pdfPages(previewBytes);
  const text = pages.join(" ");
  expect(pages.length).toBeGreaterThan(1);
  for (const pageText of pages) {
    expect(pageText).toContain(quote.number);
  }
  expect(text).toContain(quote.number);
  const compact = text.replace(/\s+/g, "");
  expect(compact).toContain(item.sku);
  expect(compact).toContain(secondBrand.sku);
  expect(compact).toContain(service.sku);
  expect(text.replace(/\s+/g, " ")).toContain("QA PDF");
  expect(text).toContain(quote.totals.total);
  expect(text).toContain(quote.totals.vat);
  expect(text).toContain(quote.vatRate);
  expect(text).toContain(customer.name.split(" ").slice(0, -1).join(" "));
  expect(text).toContain(customer.name.split(" ").at(-1));
  expect(text).toContain("office@genair.co.il");
  expect(text).toContain("ג׳נאייר מיזוג אוויר בע״מ");
  for (const heading of ["מק״ט", "תיאור מוצר", "BTU", "כמות", "מחיר ליחידה", "סה״כ מחיר"]) {
    expect(text).toContain(heading);
  }
  expect(text).toContain("אדמין");
  for (const section of [
    "תנאים כלליים",
    "תנאי תשלום",
    "מסירה",
    "אחריות",
    "תנאים נוספים",
    "אישור הזמנה",
  ]) {
    expect(text).toContain(section);
  }
  for (const field of ["שם המזמין", "תאריך אישור הזמנה", "חתימה", "בברכה"]) {
    expect(text).toContain(field);
  }
  expect(text).not.toContain("PRIVATE QA PDF NOTE");
  const downloaded = page.waitForEvent("download");
  await editor.button("הורדת PDF").click();
  const download = await downloaded;
  expect(download.suggestedFilename()).toBe(`הצעת מחיר ${quote.number}.pdf`);
  expect(await readFile(await download.path())).toEqual(previewBytes);
  expect(await uploads()).toEqual(before);

  await editor.button("סגירה").last().click();
  const project = await seedStandaloneProject(api, customer);
  expect((await api.send(HTTP_METHODS.POST, `/project-drive/${project.id}/provision`)).ok()).toBe(
    true,
  );
  const linked = await saveQuotation(api, quote.id, {
    ...quotationWrite(quote),
    projectId: project.id,
  });
  expect(await uploads()).toEqual(before);
  await page.reload();
  await setQuotationCountFixture(linked.id, QUOTATION.STATUS.APPROVED);
  await page.reload();
  const linkedResponse = page.waitForResponse(candidate =>
    candidate.url().endsWith(`/quotation/${quote.id}/pdf`),
  );
  await editor.button("ייצוא PDF").click();
  const linkedBytes = await (await linkedResponse).body();
  await writeFile(testInfo.outputPath("quotation-linked.pdf"), linkedBytes);
  const linkedText = await pdfText(linkedBytes);
  expect(linkedText).toContain("הזמנה");
  expect(linkedText).toContain(project.name.split(" ").slice(0, -1).join(" "));
  expect(linkedText).toContain(project.name.split(" ").at(-1));
  const newUploads = (await uploads()).slice(before.length);
  expect(newUploads).toHaveLength(1);
  expect(newUploads[0]).toMatchObject({
    name: `הזמנה ${quote.number}.pdf`,
    mimeType: "application/pdf",
  });
  expect(newUploads[0].bytes).toBe(linkedBytes.length);
  expect(newUploads[0].sha256).toBe(createHash("sha256").update(linkedBytes).digest("hex"));
  const contents = await api.send(HTTP_METHODS.GET, `/project-drive/${project.id}/contents`);
  expect(contents.ok()).toBe(true);
  const folders = (await contents.json()).folders as { id: string; name: string }[];
  expect(folders.find(folder => folder.name === "הצעות מחיר")?.id).toBe(newUploads[0].parentId);
});

test("quotation PDF export requires the export grant", async ({ api, apiAs }) => {
  const customer = await seedCustomer(api);
  const quotation = await createQuotation(api, customer.id);
  await withRolePermissions(
    USER_ROLES.ENGINEER,
    [PERMISSIONS.QUOTATIONS_READ, PERMISSIONS.PROJECTS_READ],
    async () => {
      const engineer = await apiAs(TEST_USERS[USER_ROLES.ENGINEER]);
      const response = await engineer.send(HTTP_METHODS.POST, `/quotation/${quotation.id}/pdf`);
      expect(response.status()).toBe(403);
    },
  );
});

test("review and cancelled quotations remain exportable and another engineer does not replace the issuer", async ({
  api,
  openPageAs,
}) => {
  const customer = await seedCustomer(api);
  const quotation = await createQuotation(api, customer.id);
  const page = await openPageAs(TEST_USERS[USER_ROLES.ENGINEER]);
  const editor = createQuotationPage(page);

  for (const status of [QUOTATION.STATUS.REVIEW, QUOTATION.STATUS.CANCELLED]) {
    if (status === QUOTATION.STATUS.REVIEW) {
      await setQuotationCountFixture(quotation.id, status);
    } else {
      const cancelled = await api.send(HTTP_METHODS.POST, `/quotation/${quotation.id}/cancel`, {
        version: quotation.version,
        reason: "QA PDF cancelled export",
      });
      expect(cancelled.status()).toBe(201);
    }
    await editor.goto(quotation.id);
    const response = page.waitForResponse(candidate =>
      candidate.url().endsWith(`/quotation/${quotation.id}/pdf`),
    );
    await editor.button("ייצוא PDF").click();
    const result = await response;
    expect(result.status()).toBe(200);
    const text = await pdfText(await result.body());
    expect(text).toContain("הצעת מחיר");
    expect(text).toContain("אדמין");
    expect(text).not.toContain("מהנדסת הנדסה");
    await editor.button("סגירה").last().click();
  }
});

test("PDF export failure is visible without opening a preview", async ({ api, page }) => {
  const quotation = await createQuotation(api, (await seedCustomer(api)).id);
  await page.route(`**/quotation/${quotation.id}/pdf`, route => route.fulfill({ status: 503 }));
  const editor = createQuotationPage(page);
  await editor.goto(quotation.id);
  await editor.button("ייצוא PDF").click();
  await expect(page.getByRole("alert")).toContainText("לא ניתן לייצא את הצעת המחיר");
  await expect(page.getByTitle("תצוגה מקדימה של PDF")).toHaveCount(0);
});
