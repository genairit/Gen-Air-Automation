import type { Response } from "@playwright/test";
import { test, expect } from "../../src/fixtures/test.fixture.ts";
import { HTTP_METHODS } from "../../src/constants/http.constant.ts";
import { USER_ROLES } from "../../src/constants/user-role.constant.ts";
import { TEST_USERS } from "../../src/constants/test-users.constant.ts";
import { createQuotationPage } from "../../src/pages/quotation.page.ts";
import { withRolePermissions } from "../../src/environment/role-permissions.ts";
import { seedQuotationForDeletion } from "../../src/api/quotation-delete-fixture.ts";
import { QUOTATION, QUOTATION_PERMISSIONS } from "../../src/constants/quotation.constant.ts";
import { quotationDocument, quotationWrite, saveQuotation } from "../../src/api/quotation.api.ts";

const ACTIONS = { CANCEL: "cancel", RESTORE: "restore" } as const;

const COPY = {
  ORDER: "הזמנה",
  CANCELLED: "מבוטלת",
  CANCEL_ORDER: "ביטול הזמנה",
  CONFIRM_CANCEL_ORDER: "בטל הזמנה",
  RESTORE_ORDER: "שחזור הזמנה",
  CONFIRM_RESTORE_ORDER: "שחזר הזמנה",
  REASON: "סיבת ביטול",
  HISTORY: "היסטוריית המסמך",
  RELOAD: "טען גרסה עדכנית",
} as const;

const actionResponse = (
  page: Parameters<typeof createQuotationPage>[0],
  id: string,
  action: (typeof ACTIONS)[keyof typeof ACTIONS],
): Promise<Response> =>
  page.waitForResponse(
    (response): boolean =>
      response.request().method() === HTTP_METHODS.POST &&
      response.url().endsWith(`/quotation/${id}/${action}`),
  );

test("approved quotation is an order, cancellation remains searchable and locked, and admin restore retains history", async ({
  page,
  api,
  openPageAs,
}): Promise<void> => {
  const { quotation } = await seedQuotationForDeletion(api, QUOTATION.STATUS.APPROVED);
  const quote = createQuotationPage(page);
  const reason = "Customer withdrew the order";
  await quote.goto(quotation.id);
  await expect(quote.button(COPY.CANCEL_ORDER)).toBeEnabled();
  await expect(page.getByText(COPY.ORDER, { exact: true }).first()).toBeVisible();
  await quote.button(COPY.CANCEL_ORDER).click();
  const cancelDialog = page.getByRole("dialog", { name: COPY.CANCEL_ORDER });
  await expect(cancelDialog).toBeVisible();
  await expect(
    cancelDialog.getByRole("button", { name: COPY.CONFIRM_CANCEL_ORDER }),
  ).toBeDisabled();
  await cancelDialog.getByRole("textbox", { name: COPY.REASON }).fill(reason);
  const cancellation = actionResponse(page, quotation.id, ACTIONS.CANCEL);
  await cancelDialog.getByRole("button", { name: COPY.CONFIRM_CANCEL_ORDER }).click();
  expect((await cancellation).status()).toBe(201);
  await expect(cancelDialog).toHaveCount(0);
  await expect(quote.button(COPY.RESTORE_ORDER)).toBeEnabled();
  await expect(quote.button(COPY.CANCEL_ORDER)).toHaveCount(0);
  await expect(quote.button("החזרה לעריכה")).toHaveCount(0);
  await page.getByText("פרטים נוספים", { exact: true }).click();
  await expect(quote.field("הערות פנימיות (לא יופיעו ללקוח)")).toBeDisabled();
  await expect(page.getByText(COPY.HISTORY, { exact: true })).toBeVisible();
  const timeline = page.getByRole("list").filter({ has: page.getByText(reason, { exact: true }) });
  await expect(timeline).toHaveCount(1);
  await expect(timeline.getByText(reason, { exact: true })).toBeVisible();
  const saved = await quotationDocument(
    await api.send(HTTP_METHODS.GET, `/quotation/${quotation.id}`),
  );
  expect(saved.status).toBe(QUOTATION.STATUS.CANCELLED);
  expect(saved.number).toBe(quotation.number);
  expect(saved.approvedAt).toBe(quotation.approvedAt);
  expect(saved.approvedById).toBe(quotation.approvedById);
  await page.goto("/quotations");
  await quote.field("חיפוש לפי מספר, לקוח, פרויקט או חברה").fill(quotation.number);
  const filters = page.getByRole("group", { name: "סינון הצעות מחיר" });
  await expect(filters.getByRole("button", { name: "הכל 1", exact: true })).toBeVisible();
  await expect(
    filters.getByRole("button", { name: `${COPY.CANCELLED} 1`, exact: true }),
  ).toBeVisible();
  await expect(filters.getByRole("button", { name: `${COPY.ORDER} 0`, exact: true })).toBeVisible();
  await filters.getByRole("button", { name: `${COPY.CANCELLED} 1`, exact: true }).click();
  await expect(page.getByRole("button", { name: new RegExp(quotation.number) })).toHaveCount(1);
  await filters.getByRole("button", { name: `${COPY.ORDER} 0`, exact: true }).click();
  await expect(page.getByRole("button", { name: new RegExp(quotation.number) })).toHaveCount(0);
  await withRolePermissions(
    USER_ROLES.ENGINEER,
    [QUOTATION_PERMISSIONS.READ, QUOTATION_PERMISSIONS.UPDATE],
    async (): Promise<void> => {
      const engineerPage = await openPageAs(TEST_USERS[USER_ROLES.ENGINEER]);
      await engineerPage.goto(`/quotations/${quotation.id}`);
      await expect(engineerPage.getByRole("button", { name: COPY.RESTORE_ORDER })).toHaveCount(0);
    },
  );
  await quote.goto(quotation.id);
  await quote.button(COPY.RESTORE_ORDER).click();
  const restoreDialog = page.getByRole("dialog", { name: COPY.RESTORE_ORDER });
  await expect(restoreDialog).toBeVisible();
  const restoration = actionResponse(page, quotation.id, ACTIONS.RESTORE);
  await restoreDialog.getByRole("button", { name: COPY.CONFIRM_RESTORE_ORDER }).click();
  expect((await restoration).status()).toBe(201);
  await expect(restoreDialog).toHaveCount(0);
  await expect(quote.button(COPY.CANCEL_ORDER)).toBeEnabled();
  const restored = await quotationDocument(
    await api.send(HTTP_METHODS.GET, `/quotation/${quotation.id}`),
  );
  expect(restored.status).toBe(QUOTATION.STATUS.APPROVED);
  expect(restored.id).toBe(quotation.id);
  expect(restored.number).toBe(quotation.number);
  expect(restored.cancellationHistory[0]?.reason).toBe(reason);
  expect(restored.cancellationHistory[0]?.restoredAt).toBeTruthy();
  await page.getByText("פרטים נוספים", { exact: true }).click();
  await expect(page.getByText("שחזור", { exact: true }).first()).toBeVisible();
});

test("cancellation conflict reloads the current version and preserves the reason before retry", async ({
  page,
  api,
}): Promise<void> => {
  const { quotation } = await seedQuotationForDeletion(api, QUOTATION.STATUS.DRAFT);
  const quote = createQuotationPage(page);
  const reason = "Changed concurrently";
  await quote.goto(quotation.id);
  await quote.button("ביטול הצעה").click();
  const dialog = page.getByRole("dialog", { name: "ביטול הצעה" });
  await dialog.getByRole("textbox", { name: COPY.REASON }).fill(reason);
  const newer = await saveQuotation(api, quotation.id, {
    ...quotationWrite(quotation),
    internalNotes: "Other editor saved first",
  });
  const conflict = actionResponse(page, quotation.id, ACTIONS.CANCEL);
  await dialog.getByRole("button", { name: "בטל הצעה" }).click();
  expect((await conflict).status()).toBe(409);
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("textbox", { name: COPY.REASON })).toHaveValue(reason);
  await dialog.getByRole("button", { name: COPY.RELOAD }).click();
  await expect(dialog.getByRole("status")).toContainText("הגרסה העדכנית נטענה");
  await expect(dialog.getByRole("textbox", { name: COPY.REASON })).toHaveValue(reason);
  const retry = actionResponse(page, quotation.id, ACTIONS.CANCEL);
  await dialog.getByRole("button", { name: "בטל הצעה" }).click();
  expect((await retry).status()).toBe(201);
  const cancelled = await quotationDocument(
    await api.send(HTTP_METHODS.GET, `/quotation/${quotation.id}`),
  );
  expect(cancelled.status).toBe(QUOTATION.STATUS.CANCELLED);
  expect(cancelled.version).toBe(newer.version + 1);
  expect(cancelled.cancellationHistory[0]?.reason).toBe(reason);
});
