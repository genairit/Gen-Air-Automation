import {
  saveQuotation,
  quotationWrite,
  createQuotation,
  quotationDocument,
} from "../../src/api/quotation.api.ts";

import {
  publicationBytes,
  quotationPublicationEffects,
} from "../../src/environment/publication-fixtures.ts";

import {
  filenameSnapshot,
  publicationRoleFolder,
  renameFilenameParties,
  seedLegacyFilenameRetry,
} from "../../src/environment/quotation-filename-fixtures.ts";

import {
  PUBLICATION_QA,
  PUBLICATION_ROLE,
  PUBLICATION_STATE,
  PUBLICATION_EFFECT,
} from "../../src/constants/quotation-publication.constant.ts";

import { createHash } from "node:crypto";
import type { TGenAirApi } from "../../src/api/gen-air-api.ts";
import { test, expect } from "../../src/fixtures/test.fixture.ts";
import { MIME_TYPES } from "../../src/constants/domain.constant.ts";
import { HTTP_METHODS } from "../../src/constants/http.constant.ts";
import { QUOTATION } from "../../src/constants/quotation.constant.ts";
import { createQuotationPage } from "../../src/pages/quotation.page.ts";
import { firstPdfPageText } from "../../src/utilities/pdf-text.utility.ts";
import { readPublication } from "../../src/api/quotation-publication.api.ts";
import { seedBuilding, buildCustomerInput } from "../../src/api/seed-data.ts";
import { seedQuotationDesign } from "../../src/api/quotation-design-fixture.ts";
import type { IQuotationDocument } from "../../src/interfaces/quotation.interface.ts";
import type { IFilenameQuotationTransition } from "../../src/interfaces/quotation-filename.interface.ts";

const transition = async ({
  api,
  quotation,
  status,
}: IFilenameQuotationTransition): Promise<IQuotationDocument> =>
  quotationDocument(
    await api.send(HTTP_METHODS.POST, `/quotation/${quotation.id}/review`, {
      version: quotation.version,
      status,
    }),
  );

const published = async (api: TGenAirApi, id: string): Promise<void> => {
  await expect
    .poll(async (): Promise<string> => (await readPublication(api, id)).state, {
      timeout: PUBLICATION_QA.RENDER_MS,
    })
    .toBe(PUBLICATION_STATE.PUBLISHED);
};

const archived = async (api: TGenAirApi, id: string): Promise<void> => {
  await expect
    .poll(async (): Promise<string> => (await readPublication(api, id)).state, {
      timeout: PUBLICATION_QA.ARCHIVE_MS,
    })
    .toBe(PUBLICATION_STATE.ARCHIVED);
};

test("v2 publication freezes canonical primary names, updates the same order ID and preserves its archived filename", async ({
  api,
}): Promise<void> => {
  test.setTimeout(PUBLICATION_QA.TEST_MS);
  const fixture = await seedQuotationDesign(api);
  const building = await seedBuilding(api, fixture.customer);
  const apartment = await api.createApartment(building.id, {
    customerId: fixture.customer.id,
    customerFloor: 1,
    customerApartment: "9",
  });
  const quotation = await saveQuotation(api, fixture.quotation.id, {
    ...quotationWrite(fixture.quotation),
    projectId: building.id,
  });
  expect((await api.send(HTTP_METHODS.POST, `/project-drive/${building.id}/provision`)).ok()).toBe(
    true,
  );
  const review = await transition({ api, quotation, status: QUOTATION.STATUS.REVIEW });
  const stored = await filenameSnapshot(review.id);
  const expectedProposal = `הצעת מחיר - ${review.number} - ${fixture.customer.name} - ${building.name} - ${QUOTATION.BRAND}.pdf`;
  expect(stored.snapshot.filenamePolicy).toBe("quotation-filename.v2");
  expect(stored.snapshot.filename).toBe(expectedProposal);
  await renameFilenameParties(fixture.customer.id, building.id);
  await published(api, review.id);
  const current = await filenameSnapshot(review.id);
  expect(current.snapshot).toEqual(stored.snapshot);
  expect(current.sourceHash).toBe(stored.sourceHash);
  const proposalEffects = await quotationPublicationEffects(review.id);
  const proposal = proposalEffects.find(
    (effect): boolean =>
      effect.action === PUBLICATION_EFFECT.CREATE && effect.mimeType === MIME_TYPES.PDF,
  );
  if (!proposal) {
    throw new Error("Missing published proposal");
  }

  expect(proposal.name).toBe(expectedProposal);
  expect(proposal.parents).toEqual([
    await publicationRoleFolder(review.id, PUBLICATION_ROLE.QUOTATION),
  ]);
  const proposalBytes = await publicationBytes(proposal);
  const acknowledged = await quotationDocument(
    await api.send(HTTP_METHODS.POST, `/quotation/${review.id}/warnings`, {
      version: review.version,
      warningKeys: review.warnings.map((warning): string => warning.key),
    }),
  );
  const order = await transition({
    api,
    quotation: acknowledged,
    status: QUOTATION.STATUS.APPROVED,
  });
  await published(api, order.id);
  const expectedOrder = `הזמנה - ${order.number} - לקוח לאחר צילום - פרויקט לאחר צילום ${building.id} - ${QUOTATION.BRAND}.pdf`;
  const orderEffects = await quotationPublicationEffects(order.id);
  const replacement = orderEffects.find(
    (effect): boolean => effect.action === PUBLICATION_EFFECT.REPLACE,
  );
  if (!replacement) {
    throw new Error("Missing published order");
  }

  expect(replacement.id).toBe(proposal.id);
  expect(replacement.name).toBe(expectedOrder);
  const orderBytes = await publicationBytes(replacement);
  expect(await firstPdfPageText(orderBytes)).toContain("הזמנה");
  const orderMove = orderEffects.find(
    (effect): boolean => effect.action === PUBLICATION_EFFECT.MOVE,
  );
  expect(orderMove?.parents).toEqual([
    await publicationRoleFolder(order.id, PUBLICATION_ROLE.ORDER),
  ]);
  expect(createHash("sha256").update(orderBytes).digest("hex")).not.toBe(
    createHash("sha256").update(proposalBytes).digest("hex"),
  );
  expect(
    orderEffects.filter(
      (effect): boolean =>
        effect.action === PUBLICATION_EFFECT.CREATE && effect.mimeType === MIME_TYPES.PDF,
    ),
  ).toHaveLength(1);
  const shared = await api.send(HTTP_METHODS.PUT, `/quotation/${order.id}/apartment-links`, {
    apartmentIds: [apartment.id],
    expectedApartmentIds: [],
  });
  expect(shared.ok()).toBe(true);
  const download = await api.send(HTTP_METHODS.POST, `/quotation/${order.id}/pdf`);
  expect(download.status()).toBe(200);
  expect(download.headers()["content-disposition"]).toBe(
    `attachment; filename*=UTF-8''${encodeURIComponent(expectedOrder)}`,
  );
  expect(decodeURIComponent(download.headers()["content-disposition"])).not.toContain(
    apartment.name,
  );
  expect(
    (
      await api.send(HTTP_METHODS.POST, `/quotation/${order.id}/cancel`, {
        version: order.version,
        reason: "Archive filename regression",
      })
    ).ok(),
  ).toBe(true);
  await archived(api, order.id);
  const after = await quotationPublicationEffects(order.id);
  const finalMove = after
    .filter((effect): boolean => effect.action === PUBLICATION_EFFECT.MOVE)
    .at(-1);
  expect(finalMove?.id).toBe(proposal.id);
  expect(finalMove?.name).toBe(expectedOrder);
  expect(finalMove?.parents).toEqual([
    await publicationRoleFolder(order.id, PUBLICATION_ROLE.ARCHIVE),
  ]);
  expect(
    after.filter(
      (effect): boolean =>
        effect.action === PUBLICATION_EFFECT.CREATE && effect.mimeType === MIME_TYPES.PDF,
    ),
  ).toHaveLength(1);
  expect(await publicationBytes(replacement)).toEqual(orderBytes);
  expect(await publicationBytes(proposal)).toEqual(proposalBytes);
});

test("a pre-existing v1 failed publication retries without recomputing its persisted filename", async ({
  api,
}): Promise<void> => {
  test.setTimeout(PUBLICATION_QA.TEST_MS);
  const fixture = await seedQuotationDesign(api);
  expect(
    (await api.send(HTTP_METHODS.POST, `/project-drive/${fixture.project.id}/provision`)).ok(),
  ).toBe(true);
  const review = await transition({
    api,
    quotation: fixture.quotation,
    status: QUOTATION.STATUS.REVIEW,
  });
  await published(api, review.id);
  const stored = await filenameSnapshot(review.id);
  await transition({ api, quotation: review, status: QUOTATION.STATUS.DRAFT });
  await archived(api, review.id);
  const historicalName = `הצעת מחיר ${review.number}_${fixture.customer.name}_${fixture.project.code}_${QUOTATION.BRAND}.pdf`;
  const legacy = await seedLegacyFilenameRetry({
    id: review.id,
    stored,
    historicalFilename: historicalName,
    projectCode: fixture.project.code,
  });
  const before = await filenameSnapshot(review.id);
  expect((await readPublication(api, review.id)).canRetry).toBe(true);
  expect(
    (
      await api.send(HTTP_METHODS.POST, `/quotation/${review.id}/publication/retry`, {
        cycleId: legacy.cycleId,
        generation: legacy.generation,
      })
    ).ok(),
  ).toBe(true);
  await published(api, review.id);
  const after = await filenameSnapshot(review.id);
  expect(after.snapshot).toEqual(before.snapshot);
  expect(after.sourceHash).toBe(legacy.sourceHash);
  const effects = (await quotationPublicationEffects(review.id)).filter(
    (effect): boolean =>
      effect.cycleId === legacy.cycleId &&
      effect.mimeType === MIME_TYPES.PDF &&
      effect.action === PUBLICATION_EFFECT.CREATE,
  );
  expect(effects).toHaveLength(1);
  const [legacyEffect] = effects;
  if (!legacyEffect) {
    throw new Error("Missing retried legacy publication");
  }

  expect(legacyEffect.name).toBe(historicalName);
  expect((await publicationBytes(legacyEffect)).subarray(0, 5).toString()).toBe("%PDF-");
});

test("long Unicode filenames stay bounded and deterministic in actual browser downloads", async ({
  api,
  page,
}, testInfo): Promise<void> => {
  const customer = await api.createCustomer({ ...buildCustomerInput(), name: "👍🏽".repeat(50) });
  const quotation = await createQuotation(api, customer.id);
  const editor = createQuotationPage(page);
  await editor.goto(quotation.id);
  const firstDownload = page.waitForEvent("download");
  await editor.button("ייצוא PDF").click();
  const first = await firstDownload;
  const name = first.suggestedFilename();
  expect(Buffer.byteLength(name, "utf8")).toBeLessThanOrEqual(240);
  expect(name).toMatch(
    new RegExp(`^הצעת מחיר - ${quotation.number}~[a-f0-9]{12} - (?:👍🏽)+\\.pdf$`, "u"),
  );
  const secondDownload = page.waitForEvent("download");
  await editor.button("ייצוא PDF").click();
  expect((await secondDownload).suggestedFilename()).toBe(name);
  expect(name).not.toContain("\ufffd");
  await expect(editor.button("ייצוא PDF")).toBeEnabled();
  await page.screenshot({
    path: testInfo.outputPath("filename-export-desktop.png"),
    fullPage: true,
  });
});
