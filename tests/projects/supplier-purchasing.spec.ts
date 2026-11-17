import { randomUUID } from "node:crypto";
import type { APIResponse } from "@playwright/test";
import type { TGenAirApi } from "../../src/api/gen-air-api.ts";
import { isRecord } from "../../src/utilities/guard.utility.ts";
import { test, expect } from "../../src/fixtures/test.fixture.ts";
import { TIME_UNITS } from "../../src/constants/time.constant.ts";
import { HTTP_METHODS } from "../../src/constants/http.constant.ts";
import { USER_ROLES } from "../../src/constants/user-role.constant.ts";
import { TEST_USERS } from "../../src/constants/test-users.constant.ts";
import { createSupplierPurchasingProject } from "../../src/api/supplier-purchasing-fixture.ts";

const supplierPath = "/supplier-agreement";
const DAY_MS = 24 * 60 * TIME_UNITS.MINUTE_MS;
const readRecord = async (response: APIResponse): Promise<Record<string, unknown>> => {
  const value: unknown = await response.json();
  if (!isRecord(value)) {
    throw new Error(`Expected object, got HTTP ${response.status()}`);
  }
  return value;
};
const requireId = (value: Record<string, unknown>): string => {
  if (typeof value.id !== "string") {
    throw new Error("Expected identifier");
  }
  return value.id;
};
const requireVersion = (value: Record<string, unknown>): number => {
  if (typeof value.version !== "number") {
    throw new Error("Expected version");
  }
  return value.version;
};
const requireHistoryLine = (
  workspace: Record<string, unknown>,
  status: string,
  recordId: string | null = null,
) => {
  const history = workspace.history;
  if (!Array.isArray(history)) {
    throw new Error("Expected purchase history");
  }
  const record = history.find(
    value =>
      isRecord(value) && value.status === status && (recordId === null || value.id === recordId),
  );
  if (!isRecord(record) || !Array.isArray(record.lines)) {
    throw new Error(`Expected ${status} purchase history record`);
  }
  const line = record.lines.find(value => isRecord(value));
  if (!isRecord(line)) {
    throw new Error("Expected purchase history line");
  }
  return { record, line };
};
const createSupplier = async (api: TGenAirApi, name: string) => {
  const response = await api.send(HTTP_METHODS.POST, `${supplierPath}/suppliers`, {
    name,
    contactName: "דנה רכש",
    phone: "050-1234567",
    email: "orders@example.com",
    notes: "QA",
  });
  expect(response.status()).toBe(201);
  return readRecord(response);
};
interface ICreateAgreementInput {
  lineId: string;
  api: TGenAirApi;
  projectId: string;
  unitPrice: string;
  supplierId: string;
}

const createAgreement = async ({
  api,
  projectId,
  lineId,
  supplierId,
  unitPrice,
}: ICreateAgreementInput) => {
  const response = await api.send(
    HTTP_METHODS.POST,
    `${supplierPath}/projects/${projectId}/agreements`,
    {
      boqLineId: lineId,
      supplierId,
      unitPrice,
      currencyCode: "ILS",
      agreedQuantity: "2",
      effectiveFrom: null,
      effectiveThrough: null,
      notes: "מחיר מוסכם",
      active: true,
    },
  );
  expect(response.status()).toBe(201);
  return readRecord(response);
};

test("manager creates supplier and agreement in RTL worksheet, then records agreed order", async ({
  api,
  openPageAs,
}) => {
  const fixture = await createSupplierPurchasingProject(api);
  const page = await openPageAs(TEST_USERS[USER_ROLES.PURCHASING_EXECUTION_MANAGER]);
  await page.goto(`/project-boqs/${fixture.project.id}`);
  await expect(page.getByRole("heading", { name: "רכש לפרויקט" })).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "רכש לפרויקט" }).locator("xpath=ancestor::*[@dir='rtl'][1]"),
  ).toHaveAttribute("dir", "rtl");
  await page.getByText("ספקים · חיפוש וניהול").click();
  await page.getByRole("searchbox", { name: "חיפוש ספק" }).focus();
  await page.keyboard.press("Tab");
  await expect(page.getByRole("button", { name: "הוסף ספק" })).toBeFocused();
  await page.getByRole("button", { name: "הוסף ספק" }).click();
  const supplierName = "ספק בדיקה";
  await page.getByRole("textbox", { name: "שם ספק" }).fill(supplierName);
  await page.getByRole("textbox", { name: "איש קשר להזמנות" }).fill("דנה רכש");
  await page.getByRole("textbox", { name: "טלפון" }).fill("050-1234567");
  await page.getByRole("button", { name: "שמור ספק" }).click();
  await expect(page.getByText(`הספק ${supplierName} נשמר`)).toBeVisible();
  await page.getByRole("searchbox", { name: "חיפוש ספק" }).fill(supplierName);
  await expect(page.getByText(supplierName, { exact: true })).toBeVisible();
  await page.getByText("מפרט ומקור כמות").click();
  await page.getByText("הסכמי ספקים").click();
  await page.getByRole("button", { name: "הוסף הסכם לחומר" }).click();
  await page.getByRole("combobox", { name: /^ספק\*/ }).click();
  await page.getByRole("option", { name: new RegExp(supplierName) }).click();
  await page.getByRole("spinbutton", { name: /מחיר מוסכם לunit/ }).fill("12.50");
  await page.getByRole("spinbutton", { name: "כמות מוסכמת לעיון (unit)" }).fill("2");
  await page.getByRole("button", { name: "שמור הסכם" }).click();
  await expect(page.getByText(/12\.5 ILS/)).toBeVisible();
  await page.getByRole("checkbox", { name: /בחר חומר ספק/ }).check();
  await page.getByRole("combobox", { name: "ספק להזמנה" }).click();
  await page.getByRole("option", { name: new RegExp(supplierName) }).click();
  await page.getByLabel("תאריך הזמנה").fill(new Date().toISOString().slice(0, 10));
  await page.getByRole("spinbutton", { name: /כמות חומר ספק/ }).fill("3");
  await expect(page.getByText(/הסכם: 12\.5 ILS/)).toBeVisible();
  await page.getByRole("button", { name: "רשום כהוזמן" }).click();
  await expect(page.getByText(/הוזמנה · ספק בדיקה/)).toBeVisible();
  await expect(page.getByText(/פרטי ספק בעת הרישום: דנה רכש/)).toBeVisible();
  await page.screenshot({ path: test.info().outputPath("supplier-order.png"), fullPage: true });
  const workspace = await readRecord(
    await api.send(HTTP_METHODS.GET, `/purchase-record/${fixture.project.id}/workspace`),
  );
  expect(requireHistoryLine(workspace, "ordered").line).toMatchObject({
    unitCost: "12.5000",
    activeQuantity: "3.00000000",
  });
  await page.getByRole("button", { name: `ערוך הסכם ${supplierName}` }).click();
  await page.getByRole("spinbutton", { name: /מחיר מוסכם לunit/ }).fill("13.75");
  await page.getByRole("button", { name: "שמור הסכם" }).click();
  await expect(page.getByText(/13\.75 ILS/)).toBeVisible();
  await page.getByRole("button", { name: `ערוך הסכם ${supplierName}` }).click();
  await page.getByRole("button", { name: "היסטוריית מחירים" }).click();
  await expect(page.getByText(/^גרסה 1 ·/)).toBeVisible();
  await expect(page.getByText(/^גרסה 2 ·/)).toBeVisible();
  await page
    .getByRole("heading", { name: "עריכת הסכם" })
    .locator("..")
    .getByRole("button", { name: "ביטול" })
    .click();
  await page.getByRole("button", { name: `ערוך ${supplierName}` }).click();
  await page.getByRole("textbox", { name: "איש קשר להזמנות" }).fill("איש קשר מעודכן");
  await page.getByRole("button", { name: "שמור ספק" }).click();
  await expect(page.getByText(/פרטי ספק בעת הרישום: דנה רכש/)).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByRole("heading", { name: "רכש לפרויקט" })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
});

test("agreement validation, versions, project scope and historical order terms", async ({
  api,
  apiAs,
}) => {
  const fixture = await createSupplierPurchasingProject(api);
  const other = await createSupplierPurchasingProject(api);
  const manager = await apiAs(TEST_USERS[USER_ROLES.PURCHASING_EXECUTION_MANAGER]);
  const engineer = await apiAs(TEST_USERS[USER_ROLES.ENGINEER]);
  expect((await engineer.send(HTTP_METHODS.GET, `${supplierPath}/suppliers`)).status()).toBe(403);
  expect(
    (
      await engineer.send(
        HTTP_METHODS.GET,
        `${supplierPath}/projects/${fixture.project.id}/agreements`,
      )
    ).status(),
  ).toBe(403);
  const first = await createSupplier(manager, `ספק ראשון ${randomUUID()}`);
  const second = await createSupplier(manager, `ספק שני ${randomUUID()}`);
  const validationSupplier = await createSupplier(manager, `ספק בדיקת מחיר ${randomUUID()}`);
  const firstId = requireId(first);
  const secondId = requireId(second);
  const agreement = await createAgreement({
    api: manager,
    projectId: fixture.project.id,
    lineId: fixture.lineId,
    supplierId: firstId,
    unitPrice: "12.5000",
  });
  const alternate = await createAgreement({
    api: manager,
    projectId: fixture.project.id,
    lineId: fixture.lineId,
    supplierId: secondId,
    unitPrice: "14.0000",
  });
  expect(requireId(agreement)).not.toBe(requireId(alternate));
  expect(
    (
      await manager.send(
        HTTP_METHODS.POST,
        `${supplierPath}/projects/${other.project.id}/agreements`,
        {
          boqLineId: fixture.lineId,
          supplierId: firstId,
          unitPrice: "12",
          currencyCode: "ILS",
        },
      )
    ).status(),
  ).toBe(404);
  expect(
    (
      await manager.send(
        HTTP_METHODS.POST,
        `${supplierPath}/projects/${fixture.project.id}/agreements`,
        {
          boqLineId: fixture.lineId,
          supplierId: requireId(validationSupplier),
          unitPrice: "12.12345",
          currencyCode: "ILS",
        },
      )
    ).status(),
  ).toBe(400);
  expect(
    (
      await manager.send(
        HTTP_METHODS.POST,
        `${supplierPath}/projects/${fixture.project.id}/agreements`,
        {
          boqLineId: fixture.lineId,
          supplierId: requireId(validationSupplier),
          unitPrice: "12.0000",
          currencyCode: "BTC",
        },
      )
    ).status(),
  ).toBe(400);
  expect(
    (
      await manager.send(HTTP_METHODS.POST, `/purchase-record/${other.project.id}/orders`, {
        idempotencyKey: randomUUID(),
        supplierId: firstId,
        orderDate: new Date().toISOString().slice(0, 10),
        lines: [
          {
            boqLineId: other.lineId,
            quantity: "1",
            agreementId: requireId(agreement),
            agreementVersion: requireVersion(agreement),
            unitCost: "12.5000",
          },
        ],
      })
    ).status(),
  ).toBe(409);
  const orderResponse = await manager.send(
    HTTP_METHODS.POST,
    `/purchase-record/${fixture.project.id}/orders`,
    {
      idempotencyKey: randomUUID(),
      supplierId: firstId,
      orderDate: new Date().toISOString().slice(0, 10),
      lines: [
        {
          boqLineId: fixture.lineId,
          quantity: "3",
          agreementId: requireId(agreement),
          agreementVersion: requireVersion(agreement),
          unitCost: "12.5000",
        },
      ],
    },
  );
  expect(orderResponse.status()).toBe(201);
  const ordered = await readRecord(orderResponse);
  const originalOrderId = requireHistoryLine(ordered, "ordered").record.id;
  if (typeof originalOrderId !== "string") {
    throw new Error("Expected original order ID");
  }
  expect(requireHistoryLine(ordered, "ordered").line).toMatchObject({
    unitCost: "12.5000",
    currencyCode: "ILS",
  });
  const changedAgreement = await manager.send(
    HTTP_METHODS.PATCH,
    `${supplierPath}/projects/${fixture.project.id}/agreements/${requireId(agreement)}`,
    {
      expectedVersion: requireVersion(agreement),
      unitPrice: "13.0000",
      currencyCode: "ILS",
      agreedQuantity: "2",
    },
  );
  expect(changedAgreement.status()).toBe(200);
  expect(
    (
      await manager.send(HTTP_METHODS.POST, `/purchase-record/${fixture.project.id}/orders`, {
        idempotencyKey: randomUUID(),
        supplierId: firstId,
        orderDate: new Date().toISOString().slice(0, 10),
        lines: [
          {
            boqLineId: fixture.lineId,
            quantity: "1",
            agreementId: requireId(agreement),
            agreementVersion: requireVersion(agreement),
            unitCost: "12.5000",
          },
        ],
      })
    ).status(),
  ).toBe(409);
  const alternateOrderResponse = await manager.send(
    HTTP_METHODS.POST,
    `/purchase-record/${fixture.project.id}/orders`,
    {
      idempotencyKey: randomUUID(),
      supplierId: secondId,
      orderDate: new Date().toISOString().slice(0, 10),
      lines: [
        {
          boqLineId: fixture.lineId,
          quantity: "2",
          agreementId: requireId(alternate),
          agreementVersion: requireVersion(alternate),
          unitCost: "14.0000",
        },
      ],
    },
  );
  expect(alternateOrderResponse.status()).toBe(201);
  expect(
    requireHistoryLine(await readRecord(alternateOrderResponse), "ordered").line,
  ).toMatchObject({ unitCost: "14.0000" });
  const futureSupplier = await createSupplier(manager, `ספק עתידי ${randomUUID()}`);
  const tomorrow = new Date(Date.now() + DAY_MS).toISOString().slice(0, 10);
  const futureResponse = await manager.send(
    HTTP_METHODS.POST,
    `${supplierPath}/projects/${fixture.project.id}/agreements`,
    {
      boqLineId: fixture.lineId,
      supplierId: requireId(futureSupplier),
      unitPrice: "11.0000",
      currencyCode: "ILS",
      effectiveFrom: tomorrow,
    },
  );
  expect(futureResponse.status()).toBe(201);
  const futureAgreement = await readRecord(futureResponse);
  expect(
    (
      await manager.send(HTTP_METHODS.POST, `/purchase-record/${fixture.project.id}/orders`, {
        idempotencyKey: randomUUID(),
        supplierId: requireId(futureSupplier),
        orderDate: new Date().toISOString().slice(0, 10),
        lines: [
          {
            boqLineId: fixture.lineId,
            quantity: "1",
            agreementId: requireId(futureAgreement),
            agreementVersion: requireVersion(futureAgreement),
            unitCost: "11.0000",
          },
        ],
      })
    ).status(),
  ).toBe(409);
  expect(
    (
      await manager.send(
        HTTP_METHODS.PATCH,
        `${supplierPath}/projects/${fixture.project.id}/agreements/${requireId(agreement)}`,
        {
          expectedVersion: requireVersion(agreement),
          unitPrice: "99",
          currencyCode: "ILS",
        },
      )
    ).status(),
  ).toBe(409);
  const changedSupplier = await manager.send(
    HTTP_METHODS.PATCH,
    `${supplierPath}/suppliers/${firstId}`,
    {
      expectedVersion: requireVersion(first),
      name: "ספק מעודכן",
      contactName: "איש קשר חדש",
    },
  );
  expect(changedSupplier.status()).toBe(200);
  const workspace = await readRecord(
    await manager.send(HTTP_METHODS.GET, `/purchase-record/${fixture.project.id}/workspace`),
  );
  const snapshot = requireHistoryLine(workspace, "ordered", originalOrderId);
  expect(snapshot.record).toMatchObject({
    supplierName: first.name,
    supplierContactName: "דנה רכש",
  });
  expect(snapshot.line).toMatchObject({
    unitCost: "12.5000",
    supplierAgreementVersion: requireVersion(agreement),
  });
  const historyResponse = await manager.send(
    HTTP_METHODS.GET,
    `${supplierPath}/projects/${fixture.project.id}/agreements/${requireId(agreement)}/history`,
  );
  expect(historyResponse.status()).toBe(200);
  const history: unknown = await historyResponse.json();
  expect(history).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ version: 1 }),
      expect.objectContaining({ version: 2 }),
    ]),
  );
});

test("held request gains negotiated supplier terms only when ordered", async ({ api, apiAs }) => {
  const fixture = await createSupplierPurchasingProject(api);
  const manager = await apiAs(TEST_USERS[USER_ROLES.PURCHASING_EXECUTION_MANAGER]);
  const supplier = await createSupplier(manager, `ספק בקשה ${randomUUID()}`);
  const agreement = await createAgreement({
    api: manager,
    projectId: fixture.project.id,
    lineId: fixture.lineId,
    supplierId: requireId(supplier),
    unitPrice: "9.7500",
  });
  const requestedResponse = await manager.send(
    HTTP_METHODS.POST,
    `/purchase-record/${fixture.project.id}/requests`,
    {
      idempotencyKey: randomUUID(),
      lines: [{ boqLineId: fixture.lineId, quantity: "4" }],
    },
  );
  expect(requestedResponse.status()).toBe(201);
  const requested = await readRecord(requestedResponse);
  expect(requested.lines).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ requestedQuantity: "4.00000000", remainingQuantity: "6.00000000" }),
    ]),
  );
  const requestRecord = requireHistoryLine(requested, "requested").record;
  const requestLine = requireHistoryLine(requested, "requested").line;
  if (typeof requestRecord.id !== "string" || typeof requestLine.id !== "string") {
    throw new Error("Expected request IDs");
  }
  for (const status of ["reviewed", "approved"]) {
    const response = await manager.send(
      HTTP_METHODS.PATCH,
      `/purchase-record/${fixture.project.id}/records/${requestRecord.id}/status`,
      {
        status,
        reason: "",
        idempotencyKey: randomUUID(),
      },
    );
    expect(response.status()).toBe(200);
  }
  const orderedResponse = await manager.send(
    HTTP_METHODS.PATCH,
    `/purchase-record/${fixture.project.id}/records/${requestRecord.id}/status`,
    {
      status: "ordered",
      reason: "",
      idempotencyKey: randomUUID(),
      supplierId: requireId(supplier),
      orderDate: new Date().toISOString().slice(0, 10),
      lines: [
        {
          recordLineId: requestLine.id,
          agreementId: requireId(agreement),
          agreementVersion: requireVersion(agreement),
          unitCost: "9.7500",
        },
      ],
    },
  );
  expect(orderedResponse.status()).toBe(200);
  const ordered = await readRecord(orderedResponse);
  expect(ordered.lines).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        requestedQuantity: "0.00000000",
        orderedQuantity: "4.00000000",
        remainingQuantity: "6.00000000",
      }),
    ]),
  );
  expect(requireHistoryLine(ordered, "ordered").line).toMatchObject({
    unitCost: "9.7500",
    supplierAgreementVersion: 1,
  });
});
