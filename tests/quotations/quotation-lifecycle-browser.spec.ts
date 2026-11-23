import {
  LIFECYCLE_COPY,
  QUOTATION_LIFECYCLE,
  LIFECYCLE_DIALOG_SCENARIOS,
} from "../../src/constants/quotation-lifecycle.constant.ts";

import { join } from "node:path";
import { mkdir } from "node:fs/promises";
import { seedUser } from "../../src/api/seed-data.ts";
import type { Page, Response } from "@playwright/test";
import { test, expect } from "../../src/fixtures/test.fixture.ts";
import { quotationDocument } from "../../src/api/quotation.api.ts";
import { QUOTATION } from "../../src/constants/quotation.constant.ts";
import { USER_ROLES } from "../../src/constants/user-role.constant.ts";
import { createQuotationPage } from "../../src/pages/quotation.page.ts";
import { KEYBOARD_KEYS } from "../../src/constants/keyboard.constant.ts";
import { createDeferred } from "../../src/utilities/deferred.utility.ts";
import { readLifecycleHistory } from "../../src/api/quotation-lifecycle.api.ts";
import { HTTP_METHODS, HTTP_STATUS } from "../../src/constants/http.constant.ts";
import { AUTOMATION_DIRECTORIES } from "../../src/constants/environment.constant.ts";
import { seedQuotationForDeletion } from "../../src/api/quotation-delete-fixture.ts";
import { expectQuotationWithinViewport } from "../../src/utilities/quotation-layout.utility.ts";

const responseFor = (page: Page, path: string): Promise<Response> =>
  page.waitForResponse((response): boolean => {
    const isCommand = response.request().method() === HTTP_METHODS.POST;
    return isCommand && response.url().endsWith(path);
  });

for (const startingStatus of [QUOTATION.STATUS.REVIEW, QUOTATION.STATUS.APPROVED]) {
  test(`${startingStatus} return is explicit reasonless keyboard confirmation and retained chronological history`, async ({
    page,
    api,
  }): Promise<void> => {
    const { quotation } = await seedQuotationForDeletion(api, startingStatus);
    const quote = createQuotationPage(page);
    await page.emulateMedia({ reducedMotion: "reduce" });
    await quote.goto(quotation.id);
    await quote.button(LIFECYCLE_COPY.RETURN).focus();
    await page.keyboard.press(KEYBOARD_KEYS.ENTER);
    const dialog = page.getByRole("dialog", { name: LIFECYCLE_COPY.RETURN });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole("textbox")).toHaveCount(0);
    await expect(dialog).toContainText("היסטוריית המסמך תישמר");
    const screenshotDirectory = join(AUTOMATION_DIRECTORIES.RESULTS, "lifecycle-proof");
    await mkdir(screenshotDirectory, { recursive: true });
    await dialog.screenshot({
      path: join(screenshotDirectory, `${startingStatus}-return-dialog.png`),
      animations: "disabled",
    });
    await dialog.getByRole("button", { name: LIFECYCLE_COPY.BACK, exact: true }).click();
    await expect(dialog).toHaveCount(0);
    await expect(quote.button(LIFECYCLE_COPY.RETURN)).toBeFocused();
    expect(
      (await readLifecycleHistory(api, quotation.id)).some(
        (event): boolean => event.action === QUOTATION_LIFECYCLE.RETURN,
      ),
    ).toBe(false);
    await quote.button(LIFECYCLE_COPY.RETURN).click();
    const response = responseFor(page, `/quotation/${quotation.id}/review`);
    await dialog.getByRole("button", { name: LIFECYCLE_COPY.CONFIRM_RETURN, exact: true }).click();
    expect((await response).status()).toBe(201);
    await expect(dialog).toHaveCount(0);
    await expect(quote.button(LIFECYCLE_COPY.RETURN)).toHaveCount(0);
    await expect(page.getByRole("heading", { name: quotation.number })).toBeFocused();
    await page.getByText("פרטים נוספים", { exact: true }).click();
    await expect(quote.field("הערות פנימיות (לא יופיעו ללקוח)")).toBeEnabled();
    await expect(page.getByRole("heading", { name: LIFECYCLE_COPY.HISTORY })).toBeVisible();
    await expect(page.getByText(new RegExp(`^${LIFECYCLE_COPY.RETURN} ·`))).toHaveCount(1);
    const timeline = page
      .getByRole("list")
      .filter({ has: page.getByText(new RegExp(`^${LIFECYCLE_COPY.RETURN} ·`)) });
    await expect(timeline.getByRole("listitem").first()).toContainText("שליחה לבדיקה");
    await expect(timeline.getByRole("listitem").last()).toContainText(LIFECYCLE_COPY.RETURN);
    const history = await readLifecycleHistory(api, quotation.id);
    await expect(timeline.getByRole("listitem").last()).toContainText(
      history.at(-1)?.actorName ?? "Missing actor",
    );
    expect(history.at(-1)).toMatchObject({
      action: QUOTATION_LIFECYCLE.RETURN,
      fromStatus: startingStatus,
      toStatus: QUOTATION.STATUS.DRAFT,
      quotationVersion: quotation.version + 1,
    });
  });
}

test("return conflict reloads authoritative state and requires an explicit fresh confirmation", async ({
  page,
  api,
}): Promise<void> => {
  const { quotation } = await seedQuotationForDeletion(api, QUOTATION.STATUS.REVIEW);
  const quote = createQuotationPage(page);
  await quote.goto(quotation.id);
  await quote.button(LIFECYCLE_COPY.RETURN).click();
  const dialog = page.getByRole("dialog", { name: LIFECYCLE_COPY.RETURN });
  const external = await quotationDocument(
    await api.send(HTTP_METHODS.POST, `/quotation/${quotation.id}/warnings`, {
      version: quotation.version,
      warningKeys: quotation.warnings.map((warning): string => warning.key),
    }),
  );
  const conflict = responseFor(page, `/quotation/${quotation.id}/review`);
  await dialog.getByRole("button", { name: LIFECYCLE_COPY.CONFIRM_RETURN, exact: true }).click();
  expect((await conflict).status()).toBe(HTTP_STATUS.CONFLICT);
  await expect(
    dialog.getByRole("button", { name: LIFECYCLE_COPY.CONFIRM_RETURN, exact: true }),
  ).toBeDisabled();
  await dialog.getByRole("button", { name: LIFECYCLE_COPY.RELOAD, exact: true }).click();
  await expect(dialog.getByRole("status")).toContainText(LIFECYCLE_COPY.LOADED);
  expect((await readLifecycleHistory(api, quotation.id)).at(-1)?.action).toBe(
    QUOTATION_LIFECYCLE.SUBMIT,
  );
  const returned = responseFor(page, `/quotation/${quotation.id}/review`);
  await dialog.getByRole("button", { name: LIFECYCLE_COPY.CONFIRM_RETURN, exact: true }).click();
  expect((await returned).status()).toBe(201);
  expect((await readLifecycleHistory(api, quotation.id)).at(-1)?.quotationVersion).toBe(
    external.version + 1,
  );
});

for (const scenario of Object.values(LIFECYCLE_DIALOG_SCENARIOS)) {
  test(`${scenario.action} dialog explains changed source after authoritative reload and preserves the applicable reason`, async ({
    page,
    api,
  }): Promise<void> => {
    const { quotation } = await seedQuotationForDeletion(api, QUOTATION.STATUS.REVIEW);
    const quote = createQuotationPage(page);
    const isReturn = scenario.action === QUOTATION_LIFECYCLE.RETURN;

    await quote.goto(quotation.id);
    await quote.button(scenario.trigger).click();
    const dialog = page.getByRole("dialog", { name: scenario.title });
    if (!isReturn) {
      await dialog
        .getByRole("textbox", { name: LIFECYCLE_COPY.REASON })
        .fill("Retained correction reason");
    }

    await api.send(HTTP_METHODS.POST, `/quotation/${quotation.id}/cancel`, {
      version: quotation.version,
      reason: "Concurrent cancellation",
    });
    const response = responseFor(page, `/quotation/${quotation.id}/${scenario.endpoint}`);
    await dialog.getByRole("button", { name: scenario.confirm, exact: true }).click();
    expect((await response).status()).toBe(HTTP_STATUS.CONFLICT);
    await dialog.getByRole("button", { name: LIFECYCLE_COPY.RELOAD, exact: true }).click();
    await expect(dialog).toContainText(LIFECYCLE_COPY.CHANGED);
    await expect(
      dialog.getByRole("button", { name: scenario.confirm, exact: true }),
    ).toBeDisabled();
    if (!isReturn) {
      await expect(dialog.getByRole("textbox", { name: LIFECYCLE_COPY.REASON })).toHaveValue(
        "Retained correction reason",
      );
    }

    await dialog.getByRole("button", { name: LIFECYCLE_COPY.BACK, exact: true }).click();
    await expect(quote.button(LIFECYCLE_COPY.RETURN)).toHaveCount(0);
  });
}

test("unknown return outcome remains visibly reload-latched after closing and autosaving an edit", async ({
  page,
  api,
}): Promise<void> => {
  const { quotation } = await seedQuotationForDeletion(api, QUOTATION.STATUS.REVIEW);
  const quote = createQuotationPage(page);
  const path = `/quotation/${quotation.id}/review`;
  await quote.goto(quotation.id);
  await page.route(
    `**${path}`,
    async (route): Promise<void> => {
      await route.abort("connectionreset");
    },
    { times: 1 },
  );
  await quote.button(LIFECYCLE_COPY.RETURN).click();
  const dialog = page.getByRole("dialog", { name: LIFECYCLE_COPY.RETURN });
  await dialog.getByRole("button", { name: LIFECYCLE_COPY.CONFIRM_RETURN, exact: true }).click();
  await expect(dialog).toContainText(LIFECYCLE_COPY.UNCERTAIN);
  await dialog.getByRole("button", { name: LIFECYCLE_COPY.BACK, exact: true }).click();
  await page.getByRole("button", { name: "עריכה", exact: true }).click();
  await page.getByText("פרטים נוספים", { exact: true }).click();
  const save = page.waitForResponse((response): boolean => {
    const isSave = response.request().method() === HTTP_METHODS.PUT;
    return isSave && response.url().endsWith(`/quotation/${quotation.id}`);
  });
  await quote
    .field("הערות פנימיות (לא יופיעו ללקוח)")
    .fill("Saved while recovery remains mandatory");
  expect((await save).status()).toBe(HTTP_STATUS.OK);
  const saved = await quotationDocument(
    await api.send(HTTP_METHODS.GET, `/quotation/${quotation.id}`),
  );
  expect(saved.internalNotes).toBe("Saved while recovery remains mandatory");
  expect(saved).toMatchObject({ status: QUOTATION.STATUS.DRAFT, version: quotation.version + 1 });
  await expect(page.getByText(LIFECYCLE_COPY.UNCERTAIN, { exact: false })).toBeVisible();
  await expect(quote.button("ביטול הצעה")).toBeDisabled();
  await expect(quote.button(LIFECYCLE_COPY.RETURN)).toHaveCount(0);
  await page.getByRole("button", { name: LIFECYCLE_COPY.RELOAD, exact: true }).click();
  await expect(quote.button("ביטול הצעה")).toBeEnabled();
  const beforeConfirmation = await readLifecycleHistory(api, quotation.id);
  const autosaveReturns = beforeConfirmation.filter(
    (event): boolean => event.action === QUOTATION_LIFECYCLE.RETURN,
  );
  expect(autosaveReturns).toHaveLength(1);
  expect(autosaveReturns[0]).toMatchObject({
    fromStatus: QUOTATION.STATUS.REVIEW,
    toStatus: QUOTATION.STATUS.DRAFT,
    actorId: api.session.user.id,
    quotationVersion: saved.version,
    reason: null,
  });
  expect(
    beforeConfirmation.some((event): boolean => event.action === QUOTATION_LIFECYCLE.CANCEL),
  ).toBe(false);
  await quote.button("ביטול הצעה").click();
  const cancelDialog = page.getByRole("dialog", { name: "ביטול הצעה" });
  await cancelDialog
    .getByRole("textbox", { name: "סיבת ביטול" })
    .fill("Explicit decision after authoritative reload");
  const response = responseFor(page, `/quotation/${quotation.id}/cancel`);
  await cancelDialog.getByRole("button", { name: "בטל הצעה", exact: true }).click();
  expect((await response).status()).toBe(HTTP_STATUS.CREATED);
  expect((await readLifecycleHistory(api, quotation.id)).at(-1)?.action).toBe(
    QUOTATION_LIFECYCLE.CANCEL,
  );
});

test("pending return locks dialog and other lifecycle groups and double click commits once", async ({
  page,
  api,
}): Promise<void> => {
  const { quotation } = await seedQuotationForDeletion(api, QUOTATION.STATUS.REVIEW);
  const quote = createQuotationPage(page);
  const observed = createDeferred();
  const release = createDeferred();
  const finished = createDeferred();
  const requests: string[] = [];
  await quote.goto(quotation.id);
  await page.route(`**/quotation/${quotation.id}/review`, async (route): Promise<void> => {
    requests.push(route.request().url());
    const response = await route.fetch();
    observed.resolve();
    await release.promise;
    await route.fulfill({ response });
    finished.resolve();
  });
  await quote.button(LIFECYCLE_COPY.RETURN).click();
  const dialog = page.getByRole("dialog", { name: LIFECYCLE_COPY.RETURN });
  await dialog.getByRole("button", { name: LIFECYCLE_COPY.CONFIRM_RETURN, exact: true }).dblclick();
  await observed.promise;
  try {
    await expect(
      dialog.getByRole("button", { name: LIFECYCLE_COPY.BACK, exact: true }),
    ).toBeDisabled();
    await expect(
      page.getByRole("button", { name: "ביטול הצעה", exact: true, includeHidden: true }),
    ).toBeDisabled();
    await expect(
      page.getByRole("button", { name: LIFECYCLE_COPY.REJECT, exact: true, includeHidden: true }),
    ).toBeDisabled();
    expect(requests).toHaveLength(1);
  } finally {
    release.resolve();
    await finished.promise;
  }
  await expect(dialog).toHaveCount(0);
  expect(
    (await readLifecycleHistory(api, quotation.id)).filter(
      (event): boolean => event.action === QUOTATION_LIFECYCLE.RETURN,
    ),
  ).toHaveLength(1);
});

test("390px RTL reasoned rejection has focused long reason reachable actions and no overflow", async ({
  page,
  api,
}, testInfo): Promise<void> => {
  const { quotation } = await seedQuotationForDeletion(api, QUOTATION.STATUS.REVIEW);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  const quote = createQuotationPage(page);
  await quote.goto(quotation.id);
  await quote.button(LIFECYCLE_COPY.REJECT).click();
  const dialog = page.getByRole("dialog", { name: LIFECYCLE_COPY.REJECT_TITLE });
  const reason = dialog.getByRole("textbox", { name: LIFECYCLE_COPY.REASON });
  await expect(dialog).toBeVisible();
  await dialog.screenshot({
    path: testInfo.outputPath("initial-dialog-focus.png"),
    animations: "disabled",
  });
  const focusedElement = await page.evaluate(
    (): string => document.activeElement?.outerHTML ?? "No active element",
  );
  await testInfo.attach("initial-dialog-focus", {
    body: focusedElement,
    contentType: "text/plain",
  });
  await expect(reason).toBeFocused();
  await reason.fill("נדרש תיקון הנדסי ושמירה על היסטוריית המסמך. ".repeat(20));
  const confirm = dialog.getByRole("button", { name: LIFECYCLE_COPY.CONFIRM_REJECT, exact: true });
  await expect(confirm).toBeEnabled();
  await expectQuotationWithinViewport(page, [
    reason,
    confirm,
    dialog.getByRole("button", { name: LIFECYCLE_COPY.BACK, exact: true }),
  ]);
  const screenshotDirectory = join(AUTOMATION_DIRECTORIES.RESULTS, "lifecycle-proof");
  await mkdir(screenshotDirectory, { recursive: true });
  await dialog.screenshot({
    path: join(screenshotDirectory, "390px-rejection-dialog.png"),
    animations: "disabled",
  });
  await page.keyboard.press(KEYBOARD_KEYS.ESCAPE);
  await expect(dialog).toHaveCount(0);
  await expect(quote.button(LIFECYCLE_COPY.REJECT)).toBeFocused();
});

for (const scenario of Object.values(LIFECYCLE_DIALOG_SCENARIOS)) {
  test(`${scenario.action} forbidden dialog latch survives reload and actual role revocation safely dismisses it`, async ({
    api,
    openPageAs,
  }): Promise<void> => {
    const { quotation } = await seedQuotationForDeletion(api, QUOTATION.STATUS.REVIEW);
    const actor = await seedUser(api, USER_ROLES.ENGINEERING_LEAD);
    const page = await openPageAs(actor);
    const quote = createQuotationPage(page);
    const isReturn = scenario.action === QUOTATION_LIFECYCLE.RETURN;

    await quote.goto(quotation.id);
    await quote.button(scenario.trigger).click();
    const dialog = page.getByRole("dialog", { name: scenario.title });
    if (!isReturn) {
      await dialog
        .getByRole("textbox", { name: LIFECYCLE_COPY.REASON })
        .fill("Permission revocation retains this reason");
    }

    const prior = await readLifecycleHistory(api, quotation.id);
    await page.route(
      `**/quotation/${quotation.id}/${scenario.endpoint}`,
      async (route): Promise<void> => {
        await route.fulfill({ status: HTTP_STATUS.FORBIDDEN, json: { message: "Forbidden" } });
      },
      { times: 1 },
    );
    const injectedResponse = responseFor(page, `/quotation/${quotation.id}/${scenario.endpoint}`);
    await dialog.getByRole("button", { name: scenario.confirm, exact: true }).click();
    expect((await injectedResponse).status()).toBe(HTTP_STATUS.FORBIDDEN);
    await expect(dialog).toContainText(LIFECYCLE_COPY.FORBIDDEN);
    await expect(
      dialog.getByRole("button", { name: scenario.confirm, exact: true }),
    ).toBeDisabled();
    await dialog.getByRole("button", { name: "טען פרטי מסמך מחדש", exact: true }).click();
    await expect(dialog).toContainText(LIFECYCLE_COPY.FORBIDDEN);
    await expect(
      dialog.getByRole("button", { name: scenario.confirm, exact: true }),
    ).toBeDisabled();
    if (!isReturn) {
      await expect(dialog.getByRole("textbox", { name: LIFECYCLE_COPY.REASON })).toHaveValue(
        "Permission revocation retains this reason",
      );
    }

    await dialog.getByRole("button", { name: LIFECYCLE_COPY.BACK, exact: true }).click();
    await expect(dialog).toHaveCount(0);
    expect(await readLifecycleHistory(api, quotation.id)).toEqual(prior);
    await page.reload();
    await quote.button(scenario.trigger).click();
    if (!isReturn) {
      await dialog
        .getByRole("textbox", { name: LIFECYCLE_COPY.REASON })
        .fill("Actual role revoked before command");
    }

    const revoke = await api.send(HTTP_METHODS.PATCH, `/user/${actor.id}`, {
      assignedRoles: [USER_ROLES.ENGINEER],
    });
    expect(revoke.status()).toBe(HTTP_STATUS.OK);
    try {
      const response = responseFor(page, `/quotation/${quotation.id}/${scenario.endpoint}`);
      await dialog.getByRole("button", { name: scenario.confirm, exact: true }).click();
      expect((await response).status()).toBe(HTTP_STATUS.FORBIDDEN);
      await expect(dialog).toHaveCount(0);
      await expect(quote.button(scenario.trigger)).toHaveCount(0);
    } finally {
      const restore = await api.send(HTTP_METHODS.PATCH, `/user/${actor.id}`, {
        assignedRoles: [USER_ROLES.ENGINEERING_LEAD],
      });
      expect(restore.status()).toBe(HTTP_STATUS.OK);
    }

    expect(await readLifecycleHistory(api, quotation.id)).toEqual(prior);
  });
}
