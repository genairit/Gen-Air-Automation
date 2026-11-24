import {
  publicationBytes,
  publicationEffects,
  quotationPublicationEffects,
} from "../../src/environment/publication-fixtures.ts";

import {
  PUBLICATION_QA,
  PUBLICATION_KIND,
  PUBLICATION_STATE,
  PUBLICATION_EFFECT,
  PUBLICATION_WITHDRAWAL,
} from "../../src/constants/quotation-publication.constant.ts";

import { randomUUID, createHash } from "node:crypto";
import { seedUser } from "../../src/api/seed-data.ts";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { test, expect } from "../../src/fixtures/api.fixture.ts";
import { URLS } from "../../src/constants/environment.constant.ts";
import { HTTP_METHODS } from "../../src/constants/http.constant.ts";
import { QUOTATION } from "../../src/constants/quotation.constant.ts";
import { USER_ROLES } from "../../src/constants/user-role.constant.ts";
import { PERMISSIONS } from "../../src/constants/permission.constant.ts";
import { readPublication } from "../../src/api/quotation-publication.api.ts";
import { withRolePermissions } from "../../src/environment/role-permissions.ts";
import { seedQuotationDesign } from "../../src/api/quotation-design-fixture.ts";
import { legacyDriveTree } from "../../src/environment/existing-drive-fixtures.ts";
import type { IQuotationDocument } from "../../src/interfaces/quotation.interface.ts";
import { createTestDatabaseClient } from "../../src/environment/test-database-client.ts";
import type { PublicationStateType } from "../../src/constants/quotation-publication.constant.ts";
import { quotationDocument, quotationWrite, saveQuotation } from "../../src/api/quotation.api.ts";

const transition = async (
  api: Parameters<typeof readPublication>[0],
  quotation: Parameters<typeof quotationWrite>[0],
  status: string,
): Promise<IQuotationDocument> =>
  quotationDocument(
    await api.send(HTTP_METHODS.POST, `/quotation/${quotation.id}/review`, {
      version: quotation.version,
      status,
    }),
  );
const text = async (bytes: Buffer): Promise<string> => {
  const document = await getDocument({ data: new Uint8Array(bytes) }).promise;
  const pages = await Promise.all(
    Array.from({ length: document.numPages }, async (_, index): Promise<string> => {
      const content = await (await document.getPage(index + 1)).getTextContent();
      return content.items.map((item): string => ("str" in item ? item.str : "")).join(" ");
    }),
  );
  await document.destroy();
  return pages.join(" ");
};

test("actual broker Worker publishes frozen review, retains proposal revision and replaces/moves the same ID with order bytes", async ({
  api,
}): Promise<void> => {
  test.setTimeout(PUBLICATION_QA.TEST_MS);
  const fixture = await seedQuotationDesign(api);
  expect(
    (await api.send(HTTP_METHODS.POST, `/project-drive/${fixture.project.id}/provision`)).ok(),
  ).toBe(true);
  expect(await readPublication(api, fixture.quotation.id)).toMatchObject({
    state: PUBLICATION_STATE.UNTRACKED,
    cycleId: null,
  });
  const review = await transition(api, fixture.quotation, QUOTATION.STATUS.REVIEW);
  const database = createTestDatabaseClient();
  await database.connect();
  try {
    await database.query("UPDATE customers SET name=$1 WHERE id=$2", [
      "AFTER CAPTURE CUSTOMER",
      fixture.customer.id,
    ]);
    await database.query("UPDATE projects SET name=$1 WHERE id=$2", [
      "AFTER CAPTURE PROJECT",
      fixture.project.id,
    ]);
  } finally {
    await database.end();
  }

  await expect
    .poll(
      async (): Promise<PublicationStateType> => (await readPublication(api, review.id)).state,
      {
        timeout: PUBLICATION_QA.RENDER_MS,
      },
    )
    .toBe(PUBLICATION_STATE.PUBLISHED);
  const proposal = await readPublication(api, review.id);
  expect(proposal).toMatchObject({
    documentKind: PUBLICATION_KIND.QUOTATION,
    sourceVersion: review.version,
    canRetry: false,
  });
  expect(proposal.fileUrl).toMatch(/^https:\/\/drive\.google\.com\//);
  const created = (await quotationPublicationEffects(review.id)).filter(
    (effect): boolean =>
      effect.action === PUBLICATION_EFFECT.CREATE && effect.mimeType === "application/pdf",
  );
  expect(created).toHaveLength(1);
  const original = created[0];
  const proposalBytes = await publicationBytes(original);
  expect(proposalBytes.subarray(0, 4).toString()).toBe("%PDF");
  const proposalText = await text(proposalBytes);
  expect(proposalText).toContain("הצעת מחיר");
  expect(proposalText).not.toContain("AFTER CAPTURE");
  const originalPartyTokens = [fixture.customer.name, fixture.project.name].flatMap(
    (name): string[] => name.split(" "),
  );
  for (const part of originalPartyTokens) {
    expect(proposalText).toContain(part);
  }

  const acknowledged = await quotationDocument(
    await api.send(HTTP_METHODS.POST, `/quotation/${review.id}/warnings`, {
      version: review.version,
      warningKeys: review.warnings.map((warning): string => warning.key),
    }),
  );
  const order = await transition(api, acknowledged, QUOTATION.STATUS.APPROVED);
  await expect
    .poll(
      async (): Promise<string> => {
        const current = await readPublication(api, order.id);
        return `${current.state}:${current.documentKind}`;
      },
      { timeout: PUBLICATION_QA.RENDER_MS },
    )
    .toBe("published:order");
  const published = await readPublication(api, order.id);
  expect(published.cycleId).toBe(proposal.cycleId);
  expect(published.fileUrl).toBe(proposal.fileUrl);
  const effects = (await publicationEffects()).filter(
    (effect): boolean => effect.id === original.id,
  );
  expect(
    effects.filter((effect): boolean => effect.action === PUBLICATION_EFFECT.CREATE),
  ).toHaveLength(1);
  expect(
    effects.some(
      (effect): boolean =>
        effect.action === PUBLICATION_EFFECT.RETAIN && effect.revisionId === original.revisionId,
    ),
  ).toBe(true);
  const replacement = effects.find(
    (effect): boolean => effect.action === PUBLICATION_EFFECT.REPLACE,
  );
  expect(replacement).toBeTruthy();
  if (!replacement) {
    throw new Error("Missing order media");
  }

  const orderBytes = await publicationBytes(replacement);
  expect(await text(orderBytes)).toContain("הזמנה");
  expect(createHash("sha256").update(orderBytes).digest("hex")).not.toBe(
    createHash("sha256").update(proposalBytes).digest("hex"),
  );
  expect(effects.at(-1)?.parents).not.toEqual(original.parents);
  expect(await publicationBytes(original)).toEqual(proposalBytes);
});

for (const withdrawal of Object.values(PUBLICATION_WITHDRAWAL)) {
  test(`${withdrawal} archives accepted file bytes and resubmission gets a fresh identity`, async ({
    api,
  }): Promise<void> => {
    test.setTimeout(PUBLICATION_QA.TEST_MS);
    const fixture = await seedQuotationDesign(api);
    expect(
      (await api.send(HTTP_METHODS.POST, `/project-drive/${fixture.project.id}/provision`)).ok(),
    ).toBe(true);
    const review = await transition(api, fixture.quotation, QUOTATION.STATUS.REVIEW);
    await expect
      .poll(
        async (): Promise<PublicationStateType> => (await readPublication(api, review.id)).state,
        {
          timeout: PUBLICATION_QA.RENDER_MS,
        },
      )
      .toBe(PUBLICATION_STATE.PUBLISHED);
    const proposal = await readPublication(api, review.id);
    const first = (await quotationPublicationEffects(review.id)).find(
      (effect): boolean =>
        effect.action === PUBLICATION_EFFECT.CREATE && effect.mimeType === "application/pdf",
    );
    if (!first) {
      throw new Error("Missing proposal");
    }

    const bytes = await publicationBytes(first);
    const commands = {
      [PUBLICATION_WITHDRAWAL.RETURN]: (): Promise<IQuotationDocument> =>
        transition(api, review, QUOTATION.STATUS.DRAFT),
      [PUBLICATION_WITHDRAWAL.REJECT]: async (): Promise<IQuotationDocument> =>
        quotationDocument(
          await api.send(HTTP_METHODS.POST, `/quotation/${review.id}/reject`, {
            version: review.version,
            reason: "Publication archive regression",
          }),
        ),
      [PUBLICATION_WITHDRAWAL.CANCEL]: async (): Promise<IQuotationDocument> =>
        quotationDocument(
          await api.send(HTTP_METHODS.POST, `/quotation/${review.id}/cancel`, {
            version: review.version,
            reason: "Publication archive regression",
          }),
        ),
    };
    const withdrawn = await commands[withdrawal]();
    await expect
      .poll(
        async (): Promise<PublicationStateType> => (await readPublication(api, review.id)).state,
        {
          timeout: PUBLICATION_QA.ARCHIVE_MS,
        },
      )
      .toBe(PUBLICATION_STATE.ARCHIVED);
    const archived = await readPublication(api, review.id);
    expect(archived.fileUrl).toBe(proposal.fileUrl);
    expect(await publicationBytes(first)).toEqual(bytes);
    const moves = (await publicationEffects()).filter(
      (effect): boolean => effect.id === first.id && effect.action === PUBLICATION_EFFECT.MOVE,
    );
    expect(moves).toHaveLength(1);
    expect(moves[0].parents).not.toEqual(first.parents);
    const resumed =
      withdrawal === PUBLICATION_WITHDRAWAL.CANCEL
        ? await quotationDocument(
            await api.send(HTTP_METHODS.POST, `/quotation/${review.id}/restore`, {
              version: withdrawn.version,
            }),
          )
        : withdrawn;
    const saved = await saveQuotation(api, resumed.id, {
      ...quotationWrite(resumed),
      internalNotes: "New cycle",
    });
    const next =
      withdrawal === PUBLICATION_WITHDRAWAL.REJECT
        ? await quotationDocument(
            await api.send(HTTP_METHODS.POST, `/quotation/${saved.id}/resubmit`, {
              version: saved.version,
            }),
          )
        : await transition(api, saved, QUOTATION.STATUS.REVIEW);
    await expect
      .poll(
        async (): Promise<PublicationStateType> => (await readPublication(api, next.id)).state,
        {
          timeout: PUBLICATION_QA.RENDER_MS,
        },
      )
      .toBe(PUBLICATION_STATE.PUBLISHED);
    const current = await readPublication(api, next.id);
    expect(current.cycleId).not.toBe(proposal.cycleId);
    expect(current.fileUrl).not.toBe(proposal.fileUrl);
    expect(await publicationBytes(first)).toEqual(bytes);
  });
}

test("draft saves and no-project review/manual download do not create publication work or Drive effects", async ({
  api,
}): Promise<void> => {
  expect(
    (await api.send(HTTP_METHODS.POST, `${URLS.PDF_WORKER}/render/quotation-pdf`, {})).status(),
  ).toBe(401);
  expect((await api.send(HTTP_METHODS.GET, `${URLS.PDF_WORKER}/health/ready`)).status()).toBe(200);
  const fixture = await seedQuotationDesign(api);
  const saved = await saveQuotation(api, fixture.quotation.id, {
    ...quotationWrite(fixture.quotation),
    projectId: null,
    internalNotes: "Draft unpublished",
  });
  expect(await readPublication(api, saved.id)).toMatchObject({
    state: PUBLICATION_STATE.NOT_APPLICABLE,
    cycleId: null,
  });
  const exported = await api.send(HTTP_METHODS.POST, `/quotation/${saved.id}/pdf`);
  expect(exported.status()).toBe(200);
  expect((await exported.body()).subarray(0, 4).toString()).toBe("%PDF");
  const review = await transition(api, saved, QUOTATION.STATUS.REVIEW);
  expect(await readPublication(api, review.id)).toMatchObject({
    state: PUBLICATION_STATE.NOT_APPLICABLE,
    cycleId: null,
    fileUrl: null,
    history: [],
  });
  expect(await quotationPublicationEffects(saved.id)).toEqual([]);
});

test("review approval and return converge to correct content and archive evidence across scheduler interleavings", async ({
  api,
}): Promise<void> => {
  test.setTimeout(PUBLICATION_QA.TEST_MS);
  const fixture = await seedQuotationDesign(api);
  expect(
    (await api.send(HTTP_METHODS.POST, `/project-drive/${fixture.project.id}/provision`)).ok(),
  ).toBe(true);
  const review = await transition(api, fixture.quotation, QUOTATION.STATUS.REVIEW);
  const acknowledged = await quotationDocument(
    await api.send(HTTP_METHODS.POST, `/quotation/${review.id}/warnings`, {
      version: review.version,
      warningKeys: review.warnings.map((warning): string => warning.key),
    }),
  );
  const order = await transition(api, acknowledged, QUOTATION.STATUS.APPROVED);
  await expect
    .poll(
      async (): Promise<string> => {
        const current = await readPublication(api, order.id);
        return `${current.state}:${current.documentKind}`;
      },
      { timeout: PUBLICATION_QA.RENDER_MS },
    )
    .toBe("published:order");
  const effects = await quotationPublicationEffects(order.id);
  const created = effects.filter(
    (effect): boolean =>
      effect.action === PUBLICATION_EFFECT.CREATE && effect.mimeType === "application/pdf",
  );
  expect(created).toHaveLength(1);
  const finalMedia = effects
    .filter(
      (effect): boolean =>
        effect.action === PUBLICATION_EFFECT.CREATE || effect.action === PUBLICATION_EFFECT.REPLACE,
    )
    .at(-1);
  if (!finalMedia) {
    throw new Error("Accepted order media is missing");
  }

  expect(finalMedia.id).toBe(created[0].id);
  expect(await text(await publicationBytes(finalMedia))).toContain("הזמנה");
  const second = await seedQuotationDesign(api);
  expect(
    (await api.send(HTTP_METHODS.POST, `/project-drive/${second.project.id}/provision`)).ok(),
  ).toBe(true);
  const submitted = await transition(api, second.quotation, QUOTATION.STATUS.REVIEW);
  await transition(api, submitted, QUOTATION.STATUS.DRAFT);
  await expect
    .poll(
      async (): Promise<PublicationStateType> => (await readPublication(api, submitted.id)).state,
      {
        timeout: PUBLICATION_QA.ARCHIVE_MS,
      },
    )
    .toBe(PUBLICATION_STATE.ARCHIVED);
  const archived = await readPublication(api, submitted.id);
  const returnedEffects = await quotationPublicationEffects(submitted.id);
  const fileCreates = returnedEffects.filter(
    (effect): boolean =>
      effect.action === PUBLICATION_EFFECT.CREATE && effect.mimeType === "application/pdf",
  );
  expect(fileCreates.length).toBeLessThanOrEqual(1);
  if (fileCreates.length === 0) {
    expect(archived).toMatchObject({ fileUrl: null, reason: "ההפקה בוטלה לפני יצירת קובץ" });
    return;
  }

  const original = fileCreates[0];
  const moves = returnedEffects.filter(
    (effect): boolean => effect.action === PUBLICATION_EFFECT.MOVE,
  );
  expect(moves).toHaveLength(1);
  expect(moves[0].id).toBe(original.id);
  expect(moves[0].md5).toBe(original.md5);
  expect(moves[0].parents).not.toEqual(original.parents);
  expect(archived).toMatchObject({ reason: null });
  expect(archived.fileUrl).toContain(original.id);
});

test("publication HTTP read/export/retry enforce live admin grants, expected cycle and metadata redaction", async ({
  api,
}): Promise<void> => {
  test.setTimeout(PUBLICATION_QA.TEST_MS);
  const fixture = await seedQuotationDesign(api);
  expect(
    (await api.send(HTTP_METHODS.POST, `/project-drive/${fixture.project.id}/provision`)).ok(),
  ).toBe(true);
  const review = await transition(api, fixture.quotation, QUOTATION.STATUS.REVIEW);
  await expect
    .poll(
      async (): Promise<PublicationStateType> => (await readPublication(api, review.id)).state,
      {
        timeout: PUBLICATION_QA.RENDER_MS,
      },
    )
    .toBe(PUBLICATION_STATE.PUBLISHED);
  const current = await readPublication(api, review.id);
  const path = `/quotation/${review.id}/publication`;
  await withRolePermissions(USER_ROLES.SYSTEM_ADMIN, [], async (): Promise<void> => {
    expect((await api.send(HTTP_METHODS.GET, path)).status()).toBe(403);
    expect((await api.send(HTTP_METHODS.POST, `/quotation/${review.id}/pdf`)).status()).toBe(403);
    expect(
      (
        await api.send(HTTP_METHODS.POST, `${path}/retry`, {
          cycleId: current.cycleId,
          generation: current.generation,
        })
      ).status(),
    ).toBe(403);
  });
  await withRolePermissions(
    USER_ROLES.SYSTEM_ADMIN,
    [PERMISSIONS.QUOTATIONS_READ],
    async (): Promise<void> => {
      const redacted = await readPublication(api, review.id);
      expect(redacted).toMatchObject({ fileUrl: null, destinationLabel: null, canRetry: false });
      expect(
        redacted.history.every(
          (entry): boolean => entry.fileUrl === null && entry.destinationLabel === null,
        ),
      ).toBe(true);
      expect(
        (
          await api.send(HTTP_METHODS.POST, `${path}/retry`, {
            cycleId: current.cycleId,
            generation: current.generation,
          })
        ).status(),
      ).toBe(403);
    },
  );
  expect(
    (await api.send(HTTP_METHODS.GET, `/quotation/${randomUUID()}/publication`)).status(),
  ).toBe(404);
  expect(
    (
      await api.send(HTTP_METHODS.POST, `${path}/retry`, {
        cycleId: randomUUID(),
        generation: current.generation,
      })
    ).status(),
  ).toBe(409);
  expect(
    (
      await api.send(HTTP_METHODS.POST, `${path}/retry`, {
        cycleId: current.cycleId,
        generation: (current.generation ?? 0) + 1,
      })
    ).status(),
  ).toBe(409);
  expect(
    (
      await api.send(HTTP_METHODS.POST, `${path}/retry`, {
        cycleId: current.cycleId,
        generation: current.generation,
        fileId: "foreign",
        projectId: randomUUID(),
      })
    ).status(),
  ).toBe(400);
  expect(await readPublication(api, review.id)).toEqual(current);
});

test("linked missing role blocks background creation until explicit template completion then retries same cycle", async ({
  api,
}): Promise<void> => {
  test.setTimeout(PUBLICATION_QA.TEST_MS);
  const fixture = await seedQuotationDesign(api);
  const legacy = await legacyDriveTree();
  const database = createTestDatabaseClient();
  await database.connect();
  try {
    await database.query(
      "UPDATE projects SET drive_folder_id=$1,drive_folder_linked=true WHERE id=$2",
      [legacy.root.id, fixture.project.id],
    );
  } finally {
    await database.end();
  }
  const review = await transition(api, fixture.quotation, QUOTATION.STATUS.REVIEW);
  await expect
    .poll(
      async (): Promise<PublicationStateType> => (await readPublication(api, review.id)).state,
      {
        timeout: PUBLICATION_QA.RENDER_MS,
      },
    )
    .toBe(PUBLICATION_STATE.PUBLISHED);
  const proposal = await readPublication(api, review.id);
  await transition(api, review, QUOTATION.STATUS.DRAFT);
  await expect
    .poll(
      async (): Promise<PublicationStateType> => (await readPublication(api, review.id)).state,
      {
        timeout: PUBLICATION_QA.ARCHIVE_MS,
      },
    )
    .toBe(PUBLICATION_STATE.FAILED);
  const blocked = await readPublication(api, review.id);
  expect(blocked.reason).toContain("תבנית");
  expect(blocked.canRetry).toBe(true);
  expect(
    (await publicationEffects()).filter(
      (effect): boolean =>
        effect.action === PUBLICATION_EFFECT.CREATE &&
        effect.mimeType === "application/vnd.google-apps.folder" &&
        effect.parents.includes(legacy.root.id),
    ),
  ).toHaveLength(0);
  expect(
    (
      await api.send(HTTP_METHODS.POST, `/project-drive/${fixture.project.id}/complete-template`)
    ).status(),
  ).toBe(201);
  expect(
    (
      await api.send(HTTP_METHODS.POST, `/quotation/${review.id}/publication/retry`, {
        cycleId: blocked.cycleId,
        generation: blocked.generation,
      })
    ).status(),
  ).toBe(201);
  await expect
    .poll(
      async (): Promise<PublicationStateType> => (await readPublication(api, review.id)).state,
      {
        timeout: PUBLICATION_QA.ARCHIVE_MS,
      },
    )
    .toBe(PUBLICATION_STATE.ARCHIVED);
  const archived = await readPublication(api, review.id);
  expect(archived.cycleId).toBe(proposal.cycleId);
  expect(archived.fileUrl).toBe(proposal.fileUrl);
});

test("distinct unprivileged identity cannot read guessed publication objects or retry another quotation", async ({
  api,
  apiAs,
}): Promise<void> => {
  const fixture = await seedQuotationDesign(api);
  const outsider = await seedUser(api, USER_ROLES.ENGINEER);
  const actor = await apiAs(outsider);
  const path = `/quotation/${fixture.quotation.id}/publication`;
  await withRolePermissions(USER_ROLES.ENGINEER, [], async (): Promise<void> => {
    expect((await actor.send(HTTP_METHODS.GET, path)).status()).toBe(403);
    expect(
      (await actor.send(HTTP_METHODS.GET, `/quotation/${randomUUID()}/publication`)).status(),
    ).toBe(403);
    expect(
      (
        await actor.send(HTTP_METHODS.POST, `${path}/retry`, {
          cycleId: randomUUID(),
          generation: 1,
        })
      ).status(),
    ).toBe(403);
  });
  await withRolePermissions(
    USER_ROLES.ENGINEER,
    [PERMISSIONS.QUOTATIONS_READ],
    async (): Promise<void> => {
      expect(await readPublication(actor, fixture.quotation.id)).toMatchObject({
        fileUrl: null,
        destinationLabel: null,
        canRetry: false,
      });
      expect(
        (await actor.send(HTTP_METHODS.GET, `/quotation/${randomUUID()}/publication`)).status(),
      ).toBe(404);
      expect(
        (
          await actor.send(HTTP_METHODS.POST, `${path}/retry`, {
            cycleId: randomUUID(),
            generation: 1,
          })
        ).status(),
      ).toBe(409);
    },
  );
});
