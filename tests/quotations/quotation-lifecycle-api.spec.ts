import {
  QUOTATION_LIFECYCLE,
  LIFECYCLE_REASON_FIXTURES,
} from "../../src/constants/quotation-lifecycle.constant.ts";

import { test, expect } from "../../src/fixtures/api.fixture.ts";
import { HTTP_METHODS } from "../../src/constants/http.constant.ts";
import { USER_ROLES } from "../../src/constants/user-role.constant.ts";
import { TEST_USERS } from "../../src/constants/test-users.constant.ts";
import { withRolePermissions } from "../../src/environment/role-permissions.ts";
import { readLifecycleHistory } from "../../src/api/quotation-lifecycle.api.ts";
import { seedQuotationForDeletion } from "../../src/api/quotation-delete-fixture.ts";
import { QUOTATION, QUOTATION_PERMISSIONS } from "../../src/constants/quotation.constant.ts";
import { quotationDocument, quotationWrite, saveQuotation } from "../../src/api/quotation.api.ts";

for (const startingStatus of [QUOTATION.STATUS.REVIEW, QUOTATION.STATUS.APPROVED]) {
  test(`${startingStatus} reasonless return retains document and prior history, clears current approval, and appends one public event`, async ({
    api,
  }): Promise<void> => {
    const { quotation } = await seedQuotationForDeletion(api, startingStatus);
    const path = `/quotation/${quotation.id}`;
    const prior = await readLifecycleHistory(api, quotation.id);
    const responses = await Promise.all(
      [0, 1].map(async (): Promise<number> => {
        const response = await api.send(HTTP_METHODS.POST, `${path}/review`, {
          version: quotation.version,
          status: QUOTATION.STATUS.DRAFT,
        });
        return response.status();
      }),
    );
    expect(responses.sort()).toEqual([201, 409]);
    const returned = await quotationDocument(await api.send(HTTP_METHODS.GET, path));
    expect(returned).toMatchObject({
      id: quotation.id,
      number: quotation.number,
      status: QUOTATION.STATUS.DRAFT,
      version: quotation.version + 1,
      approvedAt: null,
      approvedById: null,
      paymentTerms: quotation.paymentTerms,
      paymentSchedule: quotation.paymentSchedule,
      paymentTermsNote: quotation.paymentTermsNote,
      projectId: quotation.projectId,
    });
    expect(returned.sections).toEqual(quotation.sections);
    expect(returned.totals).toEqual(quotation.totals);
    expect(returned.rejectionHistory).toEqual(quotation.rejectionHistory);
    expect(returned.cancellationHistory).toEqual(quotation.cancellationHistory);
    expect(returned.warnings.every((warning): boolean => !warning.acknowledged)).toBe(true);
    const history = await readLifecycleHistory(api, quotation.id);
    expect(history).toHaveLength(prior.length + 1);
    expect(history.slice(0, prior.length)).toEqual(prior);
    const event = history.at(-1);
    expect(event).toMatchObject({
      quotationId: quotation.id,
      actorId: api.session.user.id,
      action: QUOTATION_LIFECYCLE.RETURN,
      fromStatus: startingStatus,
      toStatus: QUOTATION.STATUS.DRAFT,
      quotationVersion: returned.version,
      reason: null,
    });
    expect(Object.keys(event ?? {}).sort()).toEqual(
      [
        "id",
        "quotationId",
        "action",
        "fromStatus",
        "toStatus",
        "actorId",
        "actorName",
        "occurredAt",
        "quotationVersion",
        "reason",
      ].sort(),
    );
    expect(new Set(history.map((entry): string => entry.id)).size).toBe(history.length);
    expect(await readLifecycleHistory(api, quotation.id)).toEqual(history);
  });
}

test("review return enforces assigned reviewer and live approve grant through real HTTP without mutation", async ({
  api,
  apiAs,
}): Promise<void> => {
  const { quotation } = await seedQuotationForDeletion(api, QUOTATION.STATUS.REVIEW);
  const engineer = await apiAs(TEST_USERS[USER_ROLES.ENGINEER]);
  const lead = await apiAs(TEST_USERS[USER_ROLES.ENGINEERING_LEAD]);
  const input = { version: quotation.version, status: QUOTATION.STATUS.DRAFT };
  const path = `/quotation/${quotation.id}/review`;
  const prior = await readLifecycleHistory(api, quotation.id);
  await withRolePermissions(
    USER_ROLES.ENGINEER,
    [QUOTATION_PERMISSIONS.READ, QUOTATION_PERMISSIONS.APPROVE],
    async (): Promise<void> => {
      expect((await engineer.send(HTTP_METHODS.POST, path, input)).status()).toBe(403);
    },
  );
  await withRolePermissions(
    USER_ROLES.ENGINEERING_LEAD,
    [QUOTATION_PERMISSIONS.READ],
    async (): Promise<void> => {
      expect((await lead.send(HTTP_METHODS.POST, path, input)).status()).toBe(403);
    },
  );
  expect(await readLifecycleHistory(api, quotation.id)).toEqual(prior);
  const returned = await quotationDocument(await lead.send(HTTP_METHODS.POST, path, input));
  expect(returned.status).toBe(QUOTATION.STATUS.DRAFT);
  expect((await readLifecycleHistory(api, quotation.id)).at(-1)?.actorId).toBe(
    lead.session.user.id,
  );
});

test("reasoned rejection resubmission and editing return retain distinct immutable events while draft saves add none", async ({
  api,
}): Promise<void> => {
  const { quotation } = await seedQuotationForDeletion(api, QUOTATION.STATUS.REVIEW);
  const path = `/quotation/${quotation.id}`;
  const reason = LIFECYCLE_REASON_FIXTURES.LONG_MIXED_TEXT.trim();
  const rejected = await quotationDocument(
    await api.send(HTTP_METHODS.POST, `${path}/reject`, {
      version: quotation.version,
      reason: LIFECYCLE_REASON_FIXTURES.LONG_MIXED_TEXT,
    }),
  );
  const resubmitted = await quotationDocument(
    await api.send(HTTP_METHODS.POST, `${path}/resubmit`, { version: rejected.version }),
  );
  const returned = await saveQuotation(api, quotation.id, {
    ...quotationWrite(resubmitted),
    internalNotes: "Editing review returns to draft with an audited transition",
  });
  expect(returned).toMatchObject({
    status: QUOTATION.STATUS.DRAFT,
    version: resubmitted.version + 1,
  });
  expect(returned.rejectionHistory).toEqual(resubmitted.rejectionHistory);
  expect(returned.rejectionHistory[0]?.reason).toBe(reason);
  expect(returned.rejectionHistory[0]?.resubmittedAt).toBeTruthy();
  const history = await readLifecycleHistory(api, quotation.id);
  expect(history.map((entry): string => entry.action)).toEqual([
    QUOTATION_LIFECYCLE.SUBMIT,
    QUOTATION_LIFECYCLE.REJECT,
    QUOTATION_LIFECYCLE.RESUBMIT,
    QUOTATION_LIFECYCLE.RETURN,
  ]);
  expect(history.map((entry): number => entry.quotationVersion)).toEqual([
    quotation.version,
    rejected.version,
    resubmitted.version,
    returned.version,
  ]);
  expect(
    history.find((entry): boolean => entry.action === QUOTATION_LIFECYCLE.REJECT)?.reason,
  ).toBe(reason);
  expect(history.at(-1)).toMatchObject({
    quotationId: quotation.id,
    action: QUOTATION_LIFECYCLE.RETURN,
    fromStatus: QUOTATION.STATUS.REVIEW,
    toStatus: QUOTATION.STATUS.DRAFT,
    actorId: api.session.user.id,
    quotationVersion: returned.version,
    reason: null,
  });
  const draftResave = await saveQuotation(api, quotation.id, {
    ...quotationWrite(returned),
    internalNotes: "Ordinary draft resave does not fabricate a lifecycle transition",
  });
  expect(draftResave).toMatchObject({
    status: QUOTATION.STATUS.DRAFT,
    version: returned.version + 1,
  });
  expect(await readLifecycleHistory(api, quotation.id)).toEqual(history);
});
