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
import { TEST_USERS } from "../../src/constants/test-users.constant.ts";
import { withRolePermissions } from "../../src/environment/role-permissions.ts";
import { seedQuotationForDeletion } from "../../src/api/quotation-delete-fixture.ts";
import { createTestDatabaseClient } from "../../src/environment/test-database-client.ts";
import { QUOTATION, QUOTATION_PERMISSIONS } from "../../src/constants/quotation.constant.ts";

for (const status of Object.values(QUOTATION.STATUS)) {
  test(`delete ${status} is version-checked, hidden from active reads and retains stored lines`, async ({
    api,
  }) => {
    const { quotation, customer } = await seedQuotationForDeletion(api, status);
    expect(quotation.status).toBe(status);
    const database = createTestDatabaseClient();
    await database.connect();
    const retained = () =>
      database.query(
        `SELECT (SELECT jsonb_agg(to_jsonb(s) ORDER BY s.id) FROM quotation_sections s WHERE quotation_id=$1) AS sections, (SELECT jsonb_agg(to_jsonb(i) ORDER BY i.id) FROM quotation_items i JOIN quotation_sections s ON s.id=i.section_id WHERE s.quotation_id=$1) AS items`,
        [quotation.id],
      );
    try {
      const before = await retained();
      const counts = await quotationStatusCounts(api, customer.name);
      expect(counts).toMatchObject({ all: 1, [status]: 1 });
      const response = await api.send(HTTP_METHODS.DELETE, `/quotation/${quotation.id}`, {
        version: quotation.version,
      });
      expect(response.status()).toBe(204);
      expect(await response.text()).toBe("");
      expect((await api.send(HTTP_METHODS.GET, `/quotation/${quotation.id}`)).status()).toBe(404);
      expect(
        (
          await api.send(HTTP_METHODS.DELETE, `/quotation/${quotation.id}`, {
            version: quotation.version,
          })
        ).status(),
      ).toBe(404);
      expect(await quotationStatusCounts(api, customer.name)).toEqual({
        all: 0,
        draft: 0,
        review: 0,
        approved: 0,
        cancelled: 0,
      });
      expect(
        (
          await quotationPage(
            await api.send(
              HTTP_METHODS.GET,
              `/quotation?search=${encodeURIComponent(customer.name)}`,
            ),
          )
        ).items,
      ).toEqual([]);
      expect((await retained()).rows).toEqual(before.rows);
      const stored = await database.query<{ version: number; actor: string; deleted: boolean }>(
        "SELECT version, updated_by_id AS actor, deleted_at IS NOT NULL AS deleted FROM quotations WHERE id=$1",
        [quotation.id],
      );
      expect(stored.rows).toEqual([
        { version: quotation.version + 1, actor: api.session.user.id, deleted: true },
      ]);
      const next = await createQuotation(api, customer.id);
      expect(next.number).not.toBe(quotation.number);
    } finally {
      await database.end();
    }
  });
}

test("stale deletion and malformed commands leave the active quotation untouched", async ({
  api,
}) => {
  const { quotation } = await seedQuotationForDeletion(api, QUOTATION.STATUS.DRAFT);
  const saved = await saveQuotation(api, quotation.id, {
    ...quotationWrite(quotation),
    internalNotes: "newer version",
  });
  expect(
    (
      await api.send(HTTP_METHODS.DELETE, `/quotation/${quotation.id}`, {
        version: quotation.version,
      })
    ).status(),
  ).toBe(409);
  for (const input of [
    {},
    { version: null },
    { version: "1" },
    { version: 0 },
    { version: saved.version, deletedAt: "2026-01-01" },
  ]) {
    expect(
      (await api.send(HTTP_METHODS.DELETE, `/quotation/${quotation.id}`, input)).status(),
    ).toBe(400);
  }
  expect(
    (await api.send(HTTP_METHODS.DELETE, `/quotation/${randomUUID()}`, { version: 1 })).status(),
  ).toBe(404);
  expect(
    await quotationDocument(await api.send(HTTP_METHODS.GET, `/quotation/${quotation.id}`)),
  ).toEqual(saved);
});

test("read, edit and approve grants cannot substitute for delete permission", async ({
  api,
  apiAs,
}) => {
  const { quotation } = await seedQuotationForDeletion(api, QUOTATION.STATUS.DRAFT);
  const actor = await apiAs(TEST_USERS[USER_ROLES.ENGINEER]);
  await withRolePermissions(
    USER_ROLES.ENGINEER,
    [QUOTATION_PERMISSIONS.READ, QUOTATION_PERMISSIONS.UPDATE, QUOTATION_PERMISSIONS.APPROVE],
    async () => {
      expect(
        (
          await actor.send(HTTP_METHODS.DELETE, `/quotation/${quotation.id}`, {
            version: quotation.version,
          })
        ).status(),
      ).toBe(403);
    },
  );
  expect(
    (await quotationDocument(await api.send(HTTP_METHODS.GET, `/quotation/${quotation.id}`)))
      .version,
  ).toBe(quotation.version);
});

test("delete permission migration initially grants only system admin", async () => {
  const database = createTestDatabaseClient();
  await database.connect();
  try {
    const grants = await database.query<{ role: string }>(
      "SELECT role::text AS role FROM role_permissions WHERE permission_key=$1 ORDER BY role",
      [QUOTATION_PERMISSIONS.DELETE],
    );
    expect(grants.rows).toEqual([{ role: USER_ROLES.SYSTEM_ADMIN }]);
    const permission = await database.query<{ key: string }>(
      "SELECT key FROM permissions WHERE key=$1",
      [QUOTATION_PERMISSIONS.DELETE],
    );
    expect(permission.rows).toEqual([{ key: QUOTATION_PERMISSIONS.DELETE }]);
  } finally {
    await database.end();
  }
});
