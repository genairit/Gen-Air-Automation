import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { seedCustomer } from "../../src/api/seed-data.ts";
import { isRecord } from "../../src/utilities/guard.utility.ts";
import { test, expect } from "../../src/fixtures/api.fixture.ts";
import { HTTP_METHODS } from "../../src/constants/http.constant.ts";
import { USER_ROLES } from "../../src/constants/user-role.constant.ts";
import { TEST_USERS } from "../../src/constants/test-users.constant.ts";
import { APP_DIRECTORIES } from "../../src/constants/environment.constant.ts";
import { contactsPath } from "../../src/utilities/apartment-import.utility.ts";
import { createTestDatabaseClient } from "../../src/environment/test-database-client.ts";

const CONTACT_MIGRATION = "2026-10-28-add-customer-contacts.sql";
const MIGRATIONS_DIRECTORY = join(APP_DIRECTORIES.BACKEND, "migrations");

test("contact migration starts empty despite existing customer and project contact data", async () => {
  const name = `qa_contacts_${randomUUID().replaceAll("-", "")}`;
  const owner = createTestDatabaseClient();
  const database = createTestDatabaseClient(name);
  await owner.connect();
  await owner.query(`CREATE DATABASE ${name}`);
  await database.connect();
  try {
    const files = (await readdir(MIGRATIONS_DIRECTORY))
      .filter(file => file.endsWith(".sql") && file < CONTACT_MIGRATION)
      .sort();
    for (const file of files) {
      await database.query(await readFile(join(MIGRATIONS_DIRECTORY, file), "utf8"));
    }
    await database.query(`INSERT INTO users(first_name,last_name,email,phone,role,password_hash)
      VALUES('QA','Migration','qa-contacts@example.test','0501234567','system_admin','not-a-login')`);
    await database.query(`INSERT INTO customers(customer_type,name,tax_id,address,contact_name,phone,email,created_by_id)
      SELECT 'company','Existing customer','123456789','Existing address','Old customer contact',
        '0501234567','old-customer@example.test',id FROM users`);
    await database.query(`INSERT INTO projects(code,name,project_type_id,created_by_id,customer_id,
      customer_name,customer_phone,customer_email,contact_name,contact_phone,contact_role)
      SELECT 'GA-00055','Existing project',project_types.id,users.id,customers.id,
        'Old apartment customer','0521234567','old-apartment@example.test','Old site contact','0531234567','Site manager'
      FROM project_types CROSS JOIN users CROSS JOIN customers LIMIT 1`);
    expect((await database.query("SELECT contact_name FROM customers")).rows).toEqual([
      { contact_name: "Old customer contact" },
    ]);
    expect((await database.query("SELECT contact_name FROM projects")).rows).toEqual([
      { contact_name: "Old site contact" },
    ]);
    await database.query("CREATE ROLE anon NOLOGIN");
    await database.query("CREATE ROLE authenticated NOLOGIN");
    await database.query(await readFile(join(MIGRATIONS_DIRECTORY, CONTACT_MIGRATION), "utf8"));
    expect((await database.query("SELECT * FROM customer_contacts")).rows).toEqual([]);
    expect(
      (
        await database.query(
          "SELECT relrowsecurity FROM pg_class WHERE oid='public.customer_contacts'::regclass",
        )
      ).rows,
    ).toEqual([{ relrowsecurity: true }]);
    for (const role of ["anon", "authenticated"]) {
      const privileges = await database.query(
        "SELECT has_table_privilege($1,'public.customer_contacts','SELECT') AS can_read, has_table_privilege($1,'public.customer_contacts','INSERT') AS can_write",
        [role],
      );
      expect(privileges.rows).toEqual([{ can_read: false, can_write: false }]);
      await database.query(`SET ROLE ${role}`);
      await expect(database.query("SELECT * FROM customer_contacts")).rejects.toThrow(
        /permission denied/,
      );
      await expect(database.query("DELETE FROM customer_contacts")).rejects.toThrow(
        /permission denied/,
      );
      await database.query("RESET ROLE");
    }
    const columns = await database.query<{ column_name: string }>(
      "SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name='customer_contacts' ORDER BY column_name",
    );
    expect(columns.rows.map(row => row.column_name)).toEqual([
      "created_at",
      "created_by_id",
      "customer_id",
      "deleted_at",
      "email",
      "id",
      "name",
      "phone",
      "role",
      "updated_at",
    ]);
  } finally {
    await database.end();
    await owner.query(`DROP DATABASE ${name} WITH (FORCE)`);
    await owner.query("DROP ROLE IF EXISTS anon");
    await owner.query("DROP ROLE IF EXISTS authenticated");
    await owner.end();
  }
});

test("contact creation accepts name-only, exact duplicate reuses ID and another customer cannot edit it", async ({
  api,
}) => {
  const customer = await seedCustomer(api);
  const other = await seedCustomer(api);
  const first = await api.send(HTTP_METHODS.POST, contactsPath(customer.id), {
    name: "איש קשר ללא פרטים נוספים",
  });
  expect(first.status()).toBe(201);
  const contact: unknown = await first.json();
  if (!isRecord(contact) || typeof contact.id !== "string") {
    throw new Error("Unexpected contact response");
  }
  expect(contact).toMatchObject({ phone: null, email: null, role: null });
  expect(Object.keys(contact).sort()).toEqual([
    "createdAt",
    "createdById",
    "customerId",
    "deletedAt",
    "email",
    "id",
    "name",
    "phone",
    "role",
    "updatedAt",
  ]);
  const second = await api.send(HTTP_METHODS.POST, contactsPath(customer.id), {
    name: contact.name,
  });
  expect(await second.json()).toMatchObject({ id: contact.id });
  const wrongOwner = await api.send(HTTP_METHODS.PATCH, `${contactsPath(other.id)}/${contact.id}`, {
    name: "שינוי אסור",
  });
  expect(wrongOwner.status()).toBe(404);
  expect(await wrongOwner.json()).toMatchObject({
    statusCode: 404,
    code: "CUSTOMER_CONTACT_NOT_FOUND",
    message: "Contact was not found for this customer",
  });
  const updated = await api.send(HTTP_METHODS.PATCH, `${contactsPath(customer.id)}/${contact.id}`, {
    name: "שם מעודכן",
    role: "תכנון",
  });
  expect(updated.status()).toBe(200);
  expect(await updated.json()).toMatchObject({ id: contact.id, name: "שם מעודכן", role: "תכנון" });
});

test("non-admin can read contacts but cannot create or edit them", async ({ api, apiAs }) => {
  const customer = await seedCustomer(api);
  const created = await api.send(HTTP_METHODS.POST, contactsPath(customer.id), {
    name: "איש קשר מוגן",
  });
  expect(created.status()).toBe(201);
  const contact: unknown = await created.json();
  if (!isRecord(contact) || typeof contact.id !== "string") {
    throw new Error("Unexpected contact response");
  }
  const before = await api.send(HTTP_METHODS.GET, contactsPath(customer.id));
  const original: unknown = await before.json();
  const actor = await apiAs(TEST_USERS[USER_ROLES.PROJECT_MANAGER]);
  expect((await actor.send(HTTP_METHODS.GET, contactsPath(customer.id))).status()).toBe(200);
  expect(
    (await actor.send(HTTP_METHODS.POST, contactsPath(customer.id), { name: "לא מורשה" })).status(),
  ).toBe(403);
  expect(
    (
      await actor.send(HTTP_METHODS.PATCH, `${contactsPath(customer.id)}/${contact.id}`, {
        name: "שינוי אסור",
      })
    ).status(),
  ).toBe(403);
  const after = await api.send(HTTP_METHODS.GET, contactsPath(customer.id));
  expect(await after.json()).toEqual(original);
});

test("contact errors retain stable codes and English messages through the HTTP filter", async ({
  api,
}) => {
  const missingCustomer = await api.send(HTTP_METHODS.GET, contactsPath(randomUUID()));
  expect(missingCustomer.status()).toBe(404);
  expect(await missingCustomer.json()).toMatchObject({
    statusCode: 404,
    code: "CUSTOMER_NOT_FOUND",
    message: "Customer was not found",
  });
  const customer = await seedCustomer(api);
  const invalid = await api.send(HTTP_METHODS.POST, contactsPath(customer.id), { name: "" });
  expect(invalid.status()).toBe(400);
  expect(await invalid.text()).not.toMatch(/[\u0590-\u05ff]/);
  const first = await api.send(HTTP_METHODS.POST, contactsPath(customer.id), {
    name: "Contact one",
  });
  const second = await api.send(HTTP_METHODS.POST, contactsPath(customer.id), {
    name: "Contact two",
  });
  expect(first.status()).toBe(201);
  expect(second.status()).toBe(201);
  const contact: unknown = await second.json();
  if (!isRecord(contact) || typeof contact.id !== "string") {
    throw new Error("Unexpected contact response");
  }
  const duplicate = await api.send(
    HTTP_METHODS.PATCH,
    `${contactsPath(customer.id)}/${contact.id}`,
    { name: "Contact one" },
  );
  expect(duplicate.status()).toBe(409);
  expect(await duplicate.json()).toMatchObject({
    statusCode: 409,
    code: "DUPLICATE_CUSTOMER_CONTACT",
    message: "An identical contact already exists for this customer",
  });
  const unchanged = await api.send(HTTP_METHODS.GET, contactsPath(customer.id));
  expect(await unchanged.json()).toEqual(
    expect.arrayContaining([expect.objectContaining({ id: contact.id, name: "Contact two" })]),
  );
});
