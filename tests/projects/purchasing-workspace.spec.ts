import {
  purchaseLines,
  purchaseRecord,
  purchaseHistory,
  seedPurchasingProject,
} from "../../src/api/purchasing-fixture.ts";

import { randomUUID } from "node:crypto";
import { test, expect } from "../../src/fixtures/test.fixture.ts";
import { HTTP_METHODS } from "../../src/constants/http.constant.ts";
import { USER_ROLES } from "../../src/constants/user-role.constant.ts";
import { TEST_USERS } from "../../src/constants/test-users.constant.ts";
import { PURCHASE_STATUS } from "../../src/constants/purchasing.constant.ts";

const workspacePath = (projectId: string) => `/purchase-record/${projectId}/workspace`;
const requestPath = (projectId: string) => `/purchase-record/${projectId}/requests`;
const orderPath = (projectId: string) => `/purchase-record/${projectId}/orders`;
const input = (boqLineId: string, quantity: string, idempotencyKey = randomUUID()) => ({
  idempotencyKey,
  lines: [{ boqLineId, quantity }],
  supplierName: "QA supplier",
  orderDate: "2026-11-17",
  onBehalfOf: "QA installer",
});

test("requests hold partial quantities, reject a parallel overclaim and release on cancellation", async ({
  api,
  apiAs,
}) => {
  const { project, lines } = await seedPurchasingProject(api);
  const manager = await apiAs(TEST_USERS[USER_ROLES.PURCHASING_EXECUTION_MANAGER]);
  const engineer = await apiAs(TEST_USERS[USER_ROLES.ENGINEER]);
  expect(
    (
      await engineer.send(HTTP_METHODS.POST, requestPath(project.id), input(lines[0].id, "1"))
    ).status(),
  ).toBe(403);
  const claims = await Promise.all([
    manager.send(HTTP_METHODS.POST, requestPath(project.id), input(lines[0].id, "7")),
    manager.send(HTTP_METHODS.POST, requestPath(project.id), input(lines[0].id, "7")),
  ]);
  expect(claims.map(response => response.status()).sort()).toEqual([201, 409]);
  const held = await purchaseRecord(
    await manager.send(HTTP_METHODS.GET, workspacePath(project.id)),
  );
  expect(purchaseLines(held)[0]).toMatchObject({
    requestedQuantity: "7.00000000",
    remainingQuantity: "3.00000000",
  });
  const record = purchaseHistory(held)[0];
  if (typeof record.id !== "string") {
    throw new Error("Request record missing");
  }

  const cancelled = await manager.send(
    HTTP_METHODS.PATCH,
    `/purchase-record/${project.id}/records/${record.id}/status`,
    {
      status: PURCHASE_STATUS.CANCELLED,
      reason: "QA cancellation",
      idempotencyKey: randomUUID(),
    },
  );
  expect(cancelled.status()).toBe(200);
  const released = await purchaseRecord(
    await manager.send(HTTP_METHODS.GET, workspacePath(project.id)),
  );
  expect(purchaseLines(released)[0]).toMatchObject({
    requestedQuantity: "0.00000000",
    remainingQuantity: "10.00000000",
  });
  expect(purchaseHistory(released)[0]).toMatchObject({ status: PURCHASE_STATUS.CANCELLED });
});

test("order retries, authorized overruns and corrections retain audit history", async ({
  api,
  apiAs,
}) => {
  const { project, lines } = await seedPurchasingProject(api);
  const manager = await apiAs(TEST_USERS[USER_ROLES.PURCHASING_EXECUTION_MANAGER]);
  const engineer = await apiAs(TEST_USERS[USER_ROLES.ENGINEER]);
  const command = input(lines[0].id, "4");
  expect((await manager.send(HTTP_METHODS.POST, orderPath(project.id), command)).status()).toBe(
    201,
  );
  expect((await manager.send(HTTP_METHODS.POST, orderPath(project.id), command)).status()).toBe(
    201,
  );
  const afterRetry = await purchaseRecord(
    await manager.send(HTTP_METHODS.GET, workspacePath(project.id)),
  );
  expect(purchaseLines(afterRetry)[0]).toMatchObject({
    orderedQuantity: "4.00000000",
    remainingQuantity: "6.00000000",
  });
  expect(purchaseHistory(afterRetry)).toHaveLength(1);
  expect(
    (
      await manager.send(HTTP_METHODS.POST, orderPath(project.id), input(lines[0].id, "7"))
    ).status(),
  ).toBe(409);
  expect(
    (
      await engineer.send(HTTP_METHODS.POST, orderPath(project.id), {
        ...input(lines[0].id, "7"),
        exceptionReason: "QA overrun",
      })
    ).status(),
  ).toBe(403);
  expect(
    (
      await manager.send(HTTP_METHODS.POST, orderPath(project.id), {
        ...input(lines[0].id, "7"),
        exceptionReason: "QA overrun",
      })
    ).status(),
  ).toBe(201);
  const overrun = await purchaseRecord(
    await manager.send(HTTP_METHODS.GET, workspacePath(project.id)),
  );
  expect(purchaseLines(overrun)[0]).toMatchObject({
    orderedQuantity: "11.00000000",
    overrunQuantity: "1.00000000",
  });
  const correction = await manager.send(
    HTTP_METHODS.POST,
    `/purchase-record/${project.id}/lines/${lines[0].id}/corrections`,
    {
      idempotencyKey: randomUUID(),
      reason: "QA correction",
    },
  );
  expect(correction.status()).toBe(201);
  const corrected = await purchaseRecord(
    await manager.send(HTTP_METHODS.GET, workspacePath(project.id)),
  );
  expect(purchaseLines(corrected)[0]).toMatchObject({
    orderedQuantity: "0.00000000",
    remainingQuantity: "10.00000000",
  });
  expect(purchaseHistory(corrected)).toHaveLength(2);
  expect(purchaseHistory(corrected).flatMap(record => record.lines ?? [])).toHaveLength(2);
});

test("draft request follows reviewed and approved states before becoming ordered", async ({
  api,
  apiAs,
}) => {
  const { project, lines } = await seedPurchasingProject(api);
  const manager = await apiAs(TEST_USERS[USER_ROLES.PURCHASING_EXECUTION_MANAGER]);
  const draftResponse = await manager.send(
    HTTP_METHODS.POST,
    `/purchase-record/${project.id}/drafts`,
    input(lines[0].id, "4"),
  );
  expect(draftResponse.status()).toBe(201);
  const draft = await purchaseRecord(draftResponse);
  const record = purchaseHistory(draft)[0];
  if (typeof record.id !== "string") {
    throw new Error("Draft ID missing");
  }

  expect(purchaseLines(draft)[0]).toMatchObject({ requestedQuantity: "0.00000000" });
  const transitionPath = `/purchase-record/${project.id}/records/${record.id}/status`;
  expect(
    (
      await manager.send(HTTP_METHODS.PATCH, transitionPath, {
        status: PURCHASE_STATUS.ORDERED,
        reason: "QA invalid jump",
        idempotencyKey: randomUUID(),
      })
    ).status(),
  ).toBe(409);
  for (const status of [
    PURCHASE_STATUS.REQUESTED,
    PURCHASE_STATUS.REVIEWED,
    PURCHASE_STATUS.APPROVED,
    PURCHASE_STATUS.ORDERED,
  ]) {
    const response = await manager.send(HTTP_METHODS.PATCH, transitionPath, {
      status,
      reason: "QA progression",
      idempotencyKey: randomUUID(),
    });
    expect(response.status()).toBe(200);
    const workspace = await purchaseRecord(response);
    expect(purchaseHistory(workspace)[0]).toMatchObject({ status });
    expect(purchaseLines(workspace)[0]).toMatchObject(
      status === PURCHASE_STATUS.ORDERED
        ? { requestedQuantity: "0.00000000", orderedQuantity: "4.00000000" }
        : { requestedQuantity: "4.00000000", orderedQuantity: "0.00000000" },
    );
  }
  const ordered = await purchaseRecord(
    await manager.send(HTTP_METHODS.GET, workspacePath(project.id)),
  );
  expect(purchaseHistory(ordered)[0].events).toHaveLength(5);
});

test("manager selects across category tabs, records partial order and sees persistent history on phone", async ({
  api,
  openPageAs,
}) => {
  const { project, lines } = await seedPurchasingProject(api);
  const page = await openPageAs(TEST_USERS[USER_ROLES.PURCHASING_EXECUTION_MANAGER]);
  await page.goto(`/project-boqs/${project.id}`);
  const first = lines[0].material;
  const second = lines[1].material;
  await expect(page.getByRole("heading", { name: "רכש לפרויקט" })).toBeVisible();
  await page.getByRole("tab", { name: new RegExp(first.category) }).click();
  await page.getByRole("checkbox", { name: new RegExp(`בחר.*${first.code}`) }).check();
  await page.getByRole("tab", { name: new RegExp(second.category) }).click();
  await page.getByRole("checkbox", { name: new RegExp(`בחר.*${second.code}`) }).check();
  await page.getByRole("textbox", { name: "ספק" }).fill("QA shared supplier");
  await page.getByLabel("תאריך הזמנה").fill("2026-11-17");
  await page.getByRole("spinbutton", { name: new RegExp(`כמות.*${first.code}`) }).fill("3");
  await page.getByRole("spinbutton", { name: new RegExp(`כמות.*${second.code}`) }).fill("10");
  await page.getByRole("button", { name: "רשום כהוזמן" }).click();
  await expect(page.getByText("QA shared supplier")).toBeVisible();
  await page.reload();
  await page.getByRole("tab", { name: new RegExp(first.category) }).click();
  await expect(page.getByText("הוזמן חלקית")).toBeVisible();
  const workspace = await purchaseRecord(
    await api.send(HTTP_METHODS.GET, workspacePath(project.id)),
  );
  expect(purchaseLines(workspace).find(line => line.id === lines[0].id)).toMatchObject({
    orderedQuantity: "3.00000000",
    remainingQuantity: "7.00000000",
  });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test("ordered check is direct, failed save retains inputs, and uncheck records a correction", async ({
  api,
  openPageAs,
}) => {
  const { project, lines } = await seedPurchasingProject(api);
  const page = await openPageAs(TEST_USERS[USER_ROLES.PURCHASING_EXECUTION_MANAGER]);
  const material = lines[0].material;
  await page.goto(`/project-boqs/${project.id}`);
  const ordered = page.getByRole("checkbox", { name: new RegExp(`${material.code}: סמן הוזמן`) });
  await expect(ordered).not.toBeChecked();
  await ordered.click();
  await expect(page.getByRole("heading", { name: "רישום הזמנה לחומר" })).toBeVisible();
  await page.getByRole("textbox", { name: "ספק" }).fill("QA checkbox supplier");
  await page.getByLabel("תאריך הזמנה").fill("2026-11-17");
  await page.getByRole("spinbutton", { name: new RegExp(`כמות.*${material.code}`) }).fill("2");
  await page.route("**/purchase-record/*/orders", route =>
    route.fulfill({
      status: 500,
      contentType: "application/json",
      body: '{"message":"QA simulated failure"}',
    }),
  );
  await page.getByRole("button", { name: "רשום כהוזמן" }).click();
  await expect(page.getByText(/הפעולה נכשלה/)).toBeVisible();
  await expect(page.getByRole("textbox", { name: "ספק" })).toHaveValue("QA checkbox supplier");
  await expect(ordered).not.toBeChecked();
  await page.unroute("**/purchase-record/*/orders");
  await page.getByRole("button", { name: "רשום כהוזמן" }).click();
  await expect(
    page.getByRole("checkbox", { name: new RegExp(`${material.code}: סמן לא הוזמן`) }),
  ).toBeChecked();
  await page.reload();
  const persisted = page.getByRole("checkbox", {
    name: new RegExp(`${material.code}: סמן לא הוזמן`),
  });
  await expect(persisted).toBeChecked();
  await page.getByRole("searchbox", { name: "חיפוש בהיסטוריה" }).fill("QA checkbox supplier");
  await expect(page.getByText("QA checkbox supplier")).toBeVisible();
  await persisted.click();
  await page.getByRole("textbox", { name: "סיבת התיקון" }).fill("QA reversal");
  await page.getByRole("button", { name: "שמור תיקון" }).click();
  await expect(
    page.getByRole("checkbox", { name: new RegExp(`${material.code}: סמן הוזמן`) }),
  ).not.toBeChecked();
  const workspace = await purchaseRecord(
    await api.send(HTTP_METHODS.GET, workspacePath(project.id)),
  );
  expect(purchaseLines(workspace).find(line => line.id === lines[0].id)).toMatchObject({
    orderedQuantity: "0.00000000",
  });
  expect(purchaseHistory(workspace)[0]).toMatchObject({ status: PURCHASE_STATUS.ORDERED });
});
