import {
  saveQuotation,
  quotationPage,
  quotationWrite,
  createQuotation,
  quotationDocument,
  quotationStatusCounts,
} from "../../src/api/quotation.api.ts";

import { randomUUID } from "node:crypto";
import { test, expect } from "../../src/fixtures/api.fixture.ts";
import { HTTP_METHODS } from "../../src/constants/http.constant.ts";
import { USER_ROLES } from "../../src/constants/user-role.constant.ts";
import { PAYMENT_TERMS } from "../../src/constants/domain.constant.ts";
import { TEST_USERS } from "../../src/constants/test-users.constant.ts";
import { withRolePermissions } from "../../src/environment/role-permissions.ts";
import { createCatalogueFixture } from "../../src/environment/quotation-fixtures.ts";
import { seedQuotationForDeletion } from "../../src/api/quotation-delete-fixture.ts";
import { seedBuilding, seedApartment, seedCustomer } from "../../src/api/seed-data.ts";
import { QUOTATION, QUOTATION_PERMISSIONS } from "../../src/constants/quotation.constant.ts";

const cancel = (id: string, version: number, reason: string) => ({
  path: `/quotation/${id}/cancel`,
  input: { version, reason },
});
const restore = (id: string, version: number) => ({
  path: `/quotation/${id}/restore`,
  input: { version },
});

for (const startingStatus of [
  QUOTATION.STATUS.DRAFT,
  QUOTATION.STATUS.REVIEW,
  QUOTATION.STATUS.APPROVED,
]) {
  test(`${startingStatus} cancellation retains identity and approval history, locks edits, and admin restores the prior state`, async ({
    api,
  }) => {
    const { quotation, customer } = await seedQuotationForDeletion(api, startingStatus);
    const sibling = await createQuotation(api, customer.id);
    const reason = `Cancelled for QA ${randomUUID()}`;
    const command = cancel(quotation.id, quotation.version, `  ${reason}  `);
    const cancelled = await quotationDocument(
      await api.send(HTTP_METHODS.POST, command.path, command.input),
    );
    expect(cancelled).toMatchObject({
      id: quotation.id,
      number: quotation.number,
      customerId: quotation.customerId,
      status: QUOTATION.STATUS.CANCELLED,
      version: quotation.version + 1,
      cancelledFromStatus: startingStatus,
      approvedAt: quotation.approvedAt,
      approvedById: quotation.approvedById,
    });
    expect(cancelled.cancellationHistory).toHaveLength(1);
    expect(cancelled.cancellationHistory[0]).toMatchObject({
      kind: QUOTATION.CANCELLATION_KIND.MANUAL,
      fromStatus: startingStatus,
      reason,
      cancelledById: api.session.user.id,
      restoredAt: null,
    });
    expect(cancelled.cancellationHistory[0]?.cancelledByName).toBeTruthy();
    expect(cancelled.cancellationHistory[0]?.cancelledAt).toBeTruthy();
    expect(cancelled.sections).toEqual(quotation.sections);
    expect(cancelled.totals).toEqual(quotation.totals);
    expect(
      (await quotationDocument(await api.send(HTTP_METHODS.GET, `/quotation/${sibling.id}`)))
        .status,
    ).toBe(QUOTATION.STATUS.DRAFT);
    expect(await quotationStatusCounts(api, quotation.number)).toMatchObject({
      all: 1,
      cancelled: 1,
      [startingStatus]: 0,
    });
    const filtered = await quotationPage(
      await api.send(
        HTTP_METHODS.GET,
        `/quotation?search=${encodeURIComponent(quotation.number)}&status=${QUOTATION.STATUS.CANCELLED}`,
      ),
    );
    expect(filtered.items.map(item => item.id)).toEqual([quotation.id]);
    expect(
      (
        await api.send(HTTP_METHODS.PUT, `/quotation/${quotation.id}`, quotationWrite(cancelled))
      ).status(),
    ).toBe(409);
    expect(
      (
        await api.send(HTTP_METHODS.POST, `/quotation/${quotation.id}/review`, {
          version: cancelled.version,
          status: QUOTATION.STATUS.DRAFT,
        })
      ).status(),
    ).toBe(409);
    expect(
      (
        await api.send(HTTP_METHODS.POST, `/quotation/${quotation.id}/warnings`, {
          version: cancelled.version,
          warningKeys: [],
        })
      ).status(),
    ).toBe(409);
    const commandToRestore = restore(quotation.id, cancelled.version);
    const restored = await quotationDocument(
      await api.send(HTTP_METHODS.POST, commandToRestore.path, commandToRestore.input),
    );
    expect(restored).toMatchObject({
      id: quotation.id,
      number: quotation.number,
      status: startingStatus,
      version: cancelled.version + 1,
      cancelledFromStatus: null,
      approvedAt: quotation.approvedAt,
      approvedById: quotation.approvedById,
    });
    expect(restored.cancellationHistory).toHaveLength(1);
    expect(restored.cancellationHistory[0]).toMatchObject({
      reason,
      cancelledById: api.session.user.id,
      restoredById: api.session.user.id,
    });
    expect(restored.cancellationHistory[0]?.restoredAt).toBeTruthy();
    expect(restored.cancellationHistory[0]?.restoredByName).toBeTruthy();
    expect(await quotationStatusCounts(api, quotation.number)).toMatchObject({
      all: 1,
      cancelled: 0,
      [startingStatus]: 1,
    });
  });
}

test("direct cancellation commands reject blank reason, stale version, duplicate cancel, and non-admin restore", async ({
  api,
  apiAs,
}) => {
  const { quotation } = await seedQuotationForDeletion(api, QUOTATION.STATUS.DRAFT);
  for (const input of [
    { version: quotation.version },
    { version: quotation.version, reason: "   " },
    { version: quotation.version, reason: "x".repeat(1001) },
  ]) {
    expect(
      (await api.send(HTTP_METHODS.POST, `/quotation/${quotation.id}/cancel`, input)).status(),
    ).toBe(400);
  }
  expect(
    (
      await api.send(HTTP_METHODS.POST, `/quotation/${quotation.id}/cancel`, {
        version: quotation.version - 1,
        reason: "stale",
      })
    ).status(),
  ).toBe(409);
  const saved = await saveQuotation(api, quotation.id, {
    ...quotationWrite(quotation),
    internalNotes: "new version",
  });
  expect(
    (
      await api.send(HTTP_METHODS.POST, `/quotation/${quotation.id}/cancel`, {
        version: quotation.version,
        reason: "stale",
      })
    ).status(),
  ).toBe(409);
  const cancelled = await quotationDocument(
    await api.send(HTTP_METHODS.POST, `/quotation/${quotation.id}/cancel`, {
      version: saved.version,
      reason: "valid",
    }),
  );
  expect(
    (
      await api.send(HTTP_METHODS.POST, `/quotation/${quotation.id}/cancel`, {
        version: cancelled.version,
        reason: "again",
      })
    ).status(),
  ).toBe(409);
  const engineer = await apiAs(TEST_USERS[USER_ROLES.ENGINEER]);
  await withRolePermissions(
    USER_ROLES.ENGINEER,
    [QUOTATION_PERMISSIONS.READ, QUOTATION_PERMISSIONS.UPDATE],
    async () => {
      expect(
        (
          await engineer.send(HTTP_METHODS.POST, `/quotation/${quotation.id}/restore`, {
            version: cancelled.version,
          })
        ).status(),
      ).toBe(403);
    },
  );
  expect(
    (
      await api.send(HTTP_METHODS.POST, `/quotation/${quotation.id}/restore`, {
        version: saved.version,
      })
    ).status(),
  ).toBe(409);
  expect(
    (await quotationDocument(await api.send(HTTP_METHODS.GET, `/quotation/${quotation.id}`)))
      .status,
  ).toBe(QUOTATION.STATUS.CANCELLED);
});

test("cancellation requires an allowed active role and live quotation update grant", async ({
  api,
  apiAs,
}) => {
  const { quotation } = await seedQuotationForDeletion(api, QUOTATION.STATUS.DRAFT);
  const engineer = await apiAs(TEST_USERS[USER_ROLES.ENGINEER]);
  const purchasing = await apiAs(TEST_USERS[USER_ROLES.PURCHASING_EXECUTION_MANAGER]);
  const command = cancel(quotation.id, quotation.version, "Permission boundary");
  await withRolePermissions(USER_ROLES.ENGINEER, [QUOTATION_PERMISSIONS.READ], async () => {
    expect((await engineer.send(HTTP_METHODS.POST, command.path, command.input)).status()).toBe(
      403,
    );
  });
  await withRolePermissions(
    USER_ROLES.PURCHASING_EXECUTION_MANAGER,
    [QUOTATION_PERMISSIONS.READ, QUOTATION_PERMISSIONS.UPDATE],
    async () => {
      expect((await purchasing.send(HTTP_METHODS.POST, command.path, command.input)).status()).toBe(
        403,
      );
    },
  );
  expect(
    (await quotationDocument(await api.send(HTTP_METHODS.GET, `/quotation/${quotation.id}`)))
      .status,
  ).toBe(QUOTATION.STATUS.DRAFT);
});

test("cancel and restore responses redact linked projects without projects.read", async ({
  api,
  apiAs,
}) => {
  const customer = await seedCustomer(api);
  const building = await seedBuilding(api, customer);
  const apartment = await seedApartment(api, building);
  const original = await createQuotation(api, customer.id);
  const item = await createCatalogueFixture();
  const linked = await saveQuotation(api, original.id, {
    ...quotationWrite(original),
    projectId: building.id,
    brand: QUOTATION.BRAND,
    paymentTerms: PAYMENT_TERMS.PREPAID,
    sections: [
      {
        id: randomUUID(),
        title: "Linked order",
        systemType: QUOTATION.SYSTEM.SINGLE,
        items: [
          {
            id: randomUUID(),
            catalogueItemId: item.id,
            parentItemId: null,
            description: item.description,
            quotedPrice: item.price,
            quantity: "1",
            location: "Living room",
            circuit: null,
            requestedCapacityBtu: item.capacityBtu,
          },
        ],
      },
    ],
  });
  const review = await quotationDocument(
    await api.send(HTTP_METHODS.POST, `/quotation/${linked.id}/review`, {
      version: linked.version,
      status: QUOTATION.STATUS.REVIEW,
    }),
  );
  const acknowledged = await quotationDocument(
    await api.send(HTTP_METHODS.POST, `/quotation/${linked.id}/warnings`, {
      version: review.version,
      warningKeys: review.warnings.map(warning => warning.key),
    }),
  );
  const approved = await quotationDocument(
    await api.send(HTTP_METHODS.POST, `/quotation/${linked.id}/review`, {
      version: acknowledged.version,
      status: QUOTATION.STATUS.APPROVED,
    }),
  );
  const linkedResponse = await api.send(
    HTTP_METHODS.PUT,
    `/quotation/${linked.id}/apartment-links`,
    {
      apartmentIds: [apartment.id],
      expectedApartmentIds: [],
    },
  );
  expect(linkedResponse.status()).toBe(200);
  const quoteOnly = [QUOTATION_PERMISSIONS.READ, QUOTATION_PERMISSIONS.UPDATE];
  const adminLinked = await api.send(HTTP_METHODS.GET, `/quotation/${linked.id}`);
  expect(await adminLinked.json()).toMatchObject({
    primaryProject: { id: building.id },
    apartmentLinks: [{ apartmentId: apartment.id }],
  });
  const engineer = await apiAs(TEST_USERS[USER_ROLES.ENGINEER]);
  await withRolePermissions(USER_ROLES.ENGINEER, quoteOnly, async () => {
    const cancelled = await engineer.send(HTTP_METHODS.POST, `/quotation/${linked.id}/cancel`, {
      version: approved.version,
      reason: "Linked context stays private",
    });
    expect(cancelled.status()).toBe(201);
    expect(await cancelled.json()).toMatchObject({
      status: QUOTATION.STATUS.CANCELLED,
      primaryProject: null,
      apartmentLinks: [],
    });
  });
  const afterCancel = await quotationDocument(
    await api.send(HTTP_METHODS.GET, `/quotation/${linked.id}`),
  );
  expect(await (await api.send(HTTP_METHODS.GET, `/quotation/${linked.id}`)).json()).toMatchObject({
    primaryProject: { id: building.id },
    apartmentLinks: [{ apartmentId: apartment.id }],
  });
  await withRolePermissions(USER_ROLES.SYSTEM_ADMIN, quoteOnly, async () => {
    const restored = await api.send(HTTP_METHODS.POST, `/quotation/${linked.id}/restore`, {
      version: afterCancel.version,
    });
    expect(restored.status()).toBe(201);
    expect(await restored.json()).toMatchObject({
      status: QUOTATION.STATUS.APPROVED,
      primaryProject: null,
      apartmentLinks: [],
    });
  });
  const afterRestore = await quotationDocument(
    await api.send(HTTP_METHODS.GET, `/quotation/${linked.id}`),
  );
  expect(await (await api.send(HTTP_METHODS.GET, `/quotation/${linked.id}`)).json()).toMatchObject({
    primaryProject: { id: building.id },
    apartmentLinks: [{ apartmentId: apartment.id }],
  });
  expect(afterRestore.status).toBe(QUOTATION.STATUS.APPROVED);
});
