import { randomUUID } from "node:crypto";
import { test, expect } from "../../src/fixtures/api.fixture.ts";
import { HTTP_METHODS } from "../../src/constants/http.constant.ts";
import { seedCustomer, seedUser } from "../../src/api/seed-data.ts";
import { QUOTATION } from "../../src/constants/quotation.constant.ts";
import { USER_ROLES } from "../../src/constants/user-role.constant.ts";
import { TEST_USERS } from "../../src/constants/test-users.constant.ts";
import { PERMISSIONS } from "../../src/constants/permission.constant.ts";
import { withRolePermissions } from "../../src/environment/role-permissions.ts";
import { seedQuotationForDeletion } from "../../src/api/quotation-delete-fixture.ts";
import { createQuotation, quotationDocument, quotationWrite } from "../../src/api/quotation.api.ts";

const quotation = (id: string) => `/quotation/${id}`;
const salesAgent = (id: string) => `${quotation(id)}/sales-agent`;
const directory = "/quotation/sales-agents";

test("eligible engineer or admin can be assigned, changed, cleared and retained after role change or deletion", async ({
  api,
  apiAs,
}) => {
  const customer = await seedCustomer(api);
  const first = await seedUser(api, USER_ROLES.ENGINEER);
  const second = await seedUser(api, USER_ROLES.SYSTEM_ADMIN);
  const nonSales = await seedUser(api, USER_ROLES.INSTALLER);
  const retired = await apiAs(TEST_USERS[USER_ROLES.SALES_AGENT]);
  const unassigned = await createQuotation(api, customer.id);
  expect(unassigned.salesAgentId).toBeNull();
  expect(unassigned.salesAgentName).toBeNull();

  const listing = await api.send(HTTP_METHODS.GET, directory);
  expect(listing.status()).toBe(200);
  const agents: unknown = await listing.json();
  expect(agents).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ id: first.id, firstName: first.firstName }),
      expect.objectContaining({ id: second.id, firstName: second.firstName }),
    ]),
  );
  expect(agents).not.toEqual(
    expect.arrayContaining([expect.objectContaining({ id: nonSales.id })]),
  );
  expect(agents).not.toEqual(
    expect.arrayContaining([expect.objectContaining({ id: retired.session.user.id })]),
  );

  const created = await quotationDocument(
    await api.send(HTTP_METHODS.POST, "/quotation", {
      customerId: customer.id,
      salesAgentId: first.id,
    }),
  );
  expect(created.salesAgentId).toBe(first.id);
  expect(created.salesAgentName).toContain(first.firstName);

  const changed = await quotationDocument(
    await api.send(HTTP_METHODS.PATCH, salesAgent(created.id), {
      version: created.version,
      salesAgentId: second.id,
    }),
  );
  expect(changed.salesAgentId).toBe(second.id);
  expect(changed.salesAgentName).toContain(second.firstName);

  const saved = await quotationDocument(
    await api.send(HTTP_METHODS.PUT, quotation(created.id), quotationWrite(changed)),
  );
  expect(saved.salesAgentId).toBe(second.id);
  expect(
    (await quotationDocument(await api.send(HTTP_METHODS.GET, quotation(created.id)))).salesAgentId,
  ).toBe(second.id);

  expect(
    (
      await api.send(HTTP_METHODS.PATCH, `/user/${second.id}`, {
        assignedRoles: [USER_ROLES.INSTALLER],
      })
    ).status(),
  ).toBe(200);
  const historic = await quotationDocument(await api.send(HTTP_METHODS.GET, quotation(created.id)));
  expect(historic.salesAgentId).toBe(second.id);
  expect(historic.salesAgentName).toContain(second.firstName);
  expect(await (await api.send(HTTP_METHODS.GET, directory)).json()).not.toEqual(
    expect.arrayContaining([expect.objectContaining({ id: second.id })]),
  );

  expect((await api.send(HTTP_METHODS.DELETE, `/user/${second.id}`)).status()).toBe(204);
  const deletedAgentQuote = await quotationDocument(
    await api.send(HTTP_METHODS.GET, quotation(created.id)),
  );
  expect(deletedAgentQuote.salesAgentName).toBe(historic.salesAgentName);
  expect(await (await api.send(HTTP_METHODS.GET, directory)).json()).not.toEqual(
    expect.arrayContaining([expect.objectContaining({ id: second.id })]),
  );
  expect(
    (
      await api.send(HTTP_METHODS.PATCH, salesAgent(unassigned.id), {
        version: unassigned.version,
        salesAgentId: second.id,
      })
    ).status(),
  ).toBe(400);
  const cleared = await quotationDocument(
    await api.send(HTTP_METHODS.PATCH, salesAgent(created.id), {
      version: deletedAgentQuote.version,
      salesAgentId: null,
    }),
  );
  expect(cleared.salesAgentId).toBeNull();
  expect(cleared.salesAgentName).toBeNull();
});

test("approved quotation accepts agent reassignment without changing its approval snapshot", async ({
  api,
}) => {
  const { quotation: approved } = await seedQuotationForDeletion(api, QUOTATION.STATUS.APPROVED);
  const agent = await seedUser(api, USER_ROLES.ENGINEER);
  const updated = await quotationDocument(
    await api.send(HTTP_METHODS.PATCH, salesAgent(approved.id), {
      version: approved.version,
      salesAgentId: agent.id,
    }),
  );
  expect(updated).toMatchObject({
    status: QUOTATION.STATUS.APPROVED,
    approvedAt: approved.approvedAt,
    approvedById: approved.approvedById,
    sections: approved.sections,
    totals: approved.totals,
    salesAgentId: agent.id,
  });
  expect(
    (await quotationDocument(await api.send(HTTP_METHODS.GET, quotation(approved.id))))
      .salesAgentName,
  ).toContain(agent.firstName);
});

test("invalid, unrelated and inaccessible employee IDs are rejected without changing quotation", async ({
  api,
  apiAs,
}) => {
  const customer = await seedCustomer(api);
  const eligible = await seedUser(api, USER_ROLES.SYSTEM_ADMIN);
  const unrelated = await seedUser(api, USER_ROLES.INSTALLER);
  const retired = await apiAs(TEST_USERS[USER_ROLES.SALES_AGENT]);
  const initial = await createQuotation(api, customer.id);
  for (const id of [randomUUID(), unrelated.id, retired.session.user.id]) {
    expect(
      (
        await api.send(HTTP_METHODS.PATCH, salesAgent(initial.id), {
          version: initial.version,
          salesAgentId: id,
        })
      ).status(),
    ).toBe(400);
  }
  const actor = await apiAs(TEST_USERS[USER_ROLES.ENGINEER]);
  await withRolePermissions(
    USER_ROLES.ENGINEER,
    [PERMISSIONS.QUOTATIONS_READ, PERMISSIONS.QUOTATIONS_CREATE, PERMISSIONS.QUOTATIONS_UPDATE],
    async () => {
      expect((await actor.send(HTTP_METHODS.GET, directory)).status()).toBe(403);
      expect(
        (
          await actor.send(HTTP_METHODS.POST, "/quotation", {
            customerId: customer.id,
            salesAgentId: eligible.id,
          })
        ).status(),
      ).toBe(403);
      expect(
        (
          await actor.send(HTTP_METHODS.PATCH, salesAgent(initial.id), {
            version: initial.version,
            salesAgentId: eligible.id,
          })
        ).status(),
      ).toBe(403);
      expect(
        (
          await actor.send(HTTP_METHODS.PUT, quotation(initial.id), {
            ...quotationWrite(initial),
            salesAgentId: eligible.id,
          })
        ).status(),
      ).toBe(403);
      expect(
        (await quotationDocument(await actor.send(HTTP_METHODS.GET, quotation(initial.id))))
          .salesAgentId,
      ).toBeNull();
    },
  );
  expect(
    (await quotationDocument(await api.send(HTTP_METHODS.GET, quotation(initial.id)))).salesAgentId,
  ).toBeNull();
});

test("retired sales role has no implicit grants and cancelled quotations reject assignment", async ({
  api,
  apiAs,
}) => {
  const actor = await apiAs(TEST_USERS[USER_ROLES.SALES_AGENT]);
  expect(actor.session.user.permissions).toEqual([]);
  expect((await actor.send(HTTP_METHODS.GET, directory)).status()).toBe(403);
  expect((await actor.send(HTTP_METHODS.GET, "/quotation")).status()).toBe(403);
  const customer = await seedCustomer(api);
  const agent = await seedUser(api, USER_ROLES.ENGINEER);
  const initial = await createQuotation(api, customer.id);
  const cancelled = await quotationDocument(
    await api.send(HTTP_METHODS.POST, `${quotation(initial.id)}/cancel`, {
      version: initial.version,
      reason: "Cancelled before reassignment",
    }),
  );
  expect(
    (
      await api.send(HTTP_METHODS.PATCH, salesAgent(initial.id), {
        version: cancelled.version,
        salesAgentId: agent.id,
      })
    ).status(),
  ).toBe(409);
  expect(
    (await quotationDocument(await api.send(HTTP_METHODS.GET, quotation(initial.id)))).salesAgentId,
  ).toBeNull();
});
