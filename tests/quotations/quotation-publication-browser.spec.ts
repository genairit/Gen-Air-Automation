import {
  publicationBytes,
  acceptedPublicationProof,
  quotationPublicationEffects,
} from "../../src/environment/publication-fixtures.ts";

import {
  PUBLICATION_QA,
  PUBLICATION_KIND,
  PUBLICATION_STATE,
  PUBLICATION_EFFECT,
  PUBLICATION_FOCUS_OUTCOME,
} from "../../src/constants/quotation-publication.constant.ts";

import { createHash } from "node:crypto";
import { randomUUID } from "node:crypto";
import { ROUTES } from "../../src/constants/routes.constant.ts";
import { createLoginPage } from "../../src/pages/login.page.ts";
import { test, expect } from "../../src/fixtures/test.fixture.ts";
import { createAppShell } from "../../src/pages/app-shell.page.ts";
import { seedUser, seedBuilding } from "../../src/api/seed-data.ts";
import { HTTP_METHODS } from "../../src/constants/http.constant.ts";
import { QUOTATION } from "../../src/constants/quotation.constant.ts";
import { USER_ROLES } from "../../src/constants/user-role.constant.ts";
import { createQuotationPage } from "../../src/pages/quotation.page.ts";
import { PERMISSIONS } from "../../src/constants/permission.constant.ts";
import { createDeferred } from "../../src/utilities/deferred.utility.ts";
import { readPublication } from "../../src/api/quotation-publication.api.ts";
import { withRolePermissions } from "../../src/environment/role-permissions.ts";
import { LIFECYCLE_COPY } from "../../src/constants/quotation-lifecycle.constant.ts";
import { seedQuotationForDeletion } from "../../src/api/quotation-delete-fixture.ts";
import { expectQuotationWithinViewport } from "../../src/utilities/quotation-layout.utility.ts";
import type { PublicationStateType } from "../../src/constants/quotation-publication.constant.ts";
import { quotationDocument, quotationWrite, saveQuotation } from "../../src/api/quotation.api.ts";
import type { IPublicationSummary } from "../../src/interfaces/quotation-publication.interface.ts";

const COPY = {
  retry: "ניסיון נוסף",
  refresh: "רענון מצב הקובץ",
  failure: "שמירת הקובץ ב-Drive נכשלה",
  readError: "לא ניתן לטעון את מצב שמירת הקובץ ב-Drive",
  pending: "מפיק PDF",
  published: "הקובץ נשמר ב-Drive",
} as const;
const summary = (version: number): IPublicationSummary => ({
  state: PUBLICATION_STATE.FAILED,
  canRetry: true,
  reason: "נדרשת השלמת תבנית התיקיות" as string | null,
  cycleId: randomUUID(),
  generation: 1,
  fileUrl: null,
  sourceVersion: version,
  documentKind: PUBLICATION_KIND.QUOTATION,
  destinationLabel: "פרויקט בדיקה עם שם ארוך במיוחד — Long project apartment 123456789",
  updatedAt: "2026-11-23T12:00:00.000Z",
  history: [],
});

for (const viewport of [
  { width: 1440, height: 1000 },
  { width: 768, height: 1024 },
  { width: 390, height: 844 },
]) {
  test(`publication failure, pending, focus and retry wrap at ${viewport.width}px RTL with reduced motion`, async ({
    page,
    api,
  }, info): Promise<void> => {
    const { quotation } = await seedQuotationForDeletion(api, QUOTATION.STATUS.REVIEW);
    const current = summary(quotation.version);
    const state = { current, retries: 0 };
    const release = createDeferred();
    await page.setViewportSize(viewport);
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.route(`**/quotation/${quotation.id}/publication`, (route): Promise<void> =>
      route.fulfill({ json: state.current }),
    );
    await page.route(
      `**/quotation/${quotation.id}/publication/retry`,
      async (route): Promise<void> => {
        state.retries += 1;
        expect(route.request().postDataJSON()).toEqual({
          cycleId: current.cycleId,
          generation: current.generation,
        });
        await release.promise;
        state.current = {
          ...current,
          state: PUBLICATION_STATE.RENDERING,
          canRetry: false,
          reason: null,
        };
        await route.fulfill({ json: state.current });
      },
    );
    await createQuotationPage(page).goto(quotation.id);
    await expect(page.getByText(COPY.failure, { exact: true })).toBeVisible();
    await expect(page.getByText(current.reason ?? "Missing reason", { exact: true })).toBeVisible();
    await expect(
      page.getByText(current.destinationLabel ?? "Missing destination", { exact: false }),
    ).toBeVisible();
    const retry = page.getByRole("button", { name: COPY.retry, exact: true });
    await retry.focus();
    await expect(retry).toBeFocused();
    await expectQuotationWithinViewport(page, [retry]);
    await page.screenshot({
      path: info.outputPath(`failure-focus-${viewport.width}.png`),
      fullPage: true,
      animations: "disabled",
    });
    await retry.press("Enter");
    await expect(retry).toBeDisabled();
    await retry.press("Enter");
    await retry.press("Space");
    await retry.evaluate((element): void => {
      if (element instanceof HTMLElement) {
        element.click();
      }
    });
    expect(state.retries).toBe(1);
    await page.screenshot({
      path: info.outputPath(`retry-inflight-${viewport.width}.png`),
      fullPage: true,
      animations: "disabled",
    });
    release.resolve();
    await expect(page.getByText(COPY.pending, { exact: true })).toBeVisible();
    await expect(retry).toBeDisabled();
    await expect(retry).toBeFocused();
    await expect(page.getByRole("progressbar", { name: COPY.pending })).toBeVisible();
    await expectQuotationWithinViewport(page, [retry]);
    await page.screenshot({
      path: info.outputPath(`pending-${viewport.width}.png`),
      fullPage: true,
      animations: "disabled",
    });
    expect(state.retries).toBe(1);
    await expect(page.getByText(current.cycleId ?? "Missing cycle")).toHaveCount(0);
  });
}

test("initial publication read error offers neutral refresh and restores verified file navigation", async ({
  page,
  api,
}, info): Promise<void> => {
  const { quotation } = await seedQuotationForDeletion(api, QUOTATION.STATUS.REVIEW);
  const state = { fail: true };
  const current = {
    ...summary(quotation.version),
    state: PUBLICATION_STATE.PUBLISHED,
    canRetry: false,
    reason: null,
    fileUrl: "https://drive.google.com/open?id=qa-approved-file",
  };
  await page.route(`**/quotation/${quotation.id}/publication`, (route): Promise<void> =>
    state.fail
      ? route.fulfill({ status: 503, json: { message: "Unavailable" } })
      : route.fulfill({ json: current }),
  );
  await createQuotationPage(page).goto(quotation.id);
  await expect(page.getByText(COPY.readError, { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: COPY.retry, exact: true })).toHaveCount(0);
  await page.screenshot({
    path: info.outputPath("read-error-neutral-refresh.png"),
    fullPage: true,
    animations: "disabled",
  });
  state.fail = false;
  await page.getByRole("button", { name: COPY.refresh, exact: true }).click();
  await expect(page.getByText(COPY.published, { exact: true })).toBeVisible();
  const link = page.getByRole("link", { name: "פתיחת הקובץ (בחלון חדש)", exact: true });
  await expect(link).toHaveAttribute("href", current.fileUrl);
  await expect(link).toHaveAttribute("rel", "noopener noreferrer");
  await expect(link).toHaveAttribute("target", "_blank");
  await expect(page.getByRole("button", { name: COPY.refresh, exact: true })).toHaveCount(0);
});

test("saved browser review publishes through real broker and one existing history timeline retains archive context", async ({
  page,
  api,
}, info): Promise<void> => {
  test.setTimeout(PUBLICATION_QA.TEST_MS);
  const { quotation, project } = await seedQuotationForDeletion(api, QUOTATION.STATUS.DRAFT);
  const provision = await api.send(HTTP_METHODS.POST, `/project-drive/${project.id}/provision`);
  expect(provision.ok()).toBe(true);
  const editor = createQuotationPage(page);
  await editor.goto(quotation.id);
  await expect(
    page.getByText("הקובץ יישמר ב-Drive לאחר שליחה לבדיקה", { exact: true }),
  ).toBeVisible();
  await editor.fill(`כמות (${quotation.sections[0].items[0].unit})`, "3");
  const saved = await quotationDocument(
    await api.send(HTTP_METHODS.GET, `/quotation/${quotation.id}`),
  );
  expect(saved.version).toBe(quotation.version + 1);
  expect(Number(saved.sections[0].items[0].quantity)).toBe(3);
  await editor.transition("סיימתי, לבדיקה");
  await expect(page.getByText(COPY.published, { exact: true })).toBeVisible({
    timeout: PUBLICATION_QA.RENDER_MS,
  });
  const committed = await quotationDocument(
    await api.send(HTTP_METHODS.GET, `/quotation/${quotation.id}`),
  );
  const publication = await readPublication(api, quotation.id);
  const proof = await acceptedPublicationProof(quotation.id);
  expect(committed.version).toBe(saved.version + 1);
  expect(publication.sourceVersion).toBe(committed.version);
  expect(proof).toMatchObject({
    sourceVersion: committed.version,
    sourceSnapshotVersion: String(committed.version),
    documentVersion: String(committed.version),
    lineId: saved.sections[0].items[0].id,
  });
  expect(Number(proof.sourceQuantity)).toBe(3);
  expect(Number(proof.documentQuantity)).toBe(3);
  const created = (await quotationPublicationEffects(quotation.id)).filter(
    (effect): boolean => effect.action === PUBLICATION_EFFECT.CREATE && effect.id === proof.fileId,
  );
  expect(created).toHaveLength(1);
  expect(
    createHash("sha256")
      .update(await publicationBytes(created[0]))
      .digest("hex"),
  ).toBe(proof.hash);
  const link = page.getByRole("link", { name: "פתיחת הקובץ (בחלון חדש)", exact: true });
  const file = await link.getAttribute("href");
  expect(file).toMatch(/^https:\/\/drive\.google\.com\/open\?id=[a-zA-Z0-9_-]+$/);
  await page.screenshot({
    path: info.outputPath("real-broker-publication-desktop.png"),
    fullPage: true,
    animations: "disabled",
  });
  await editor.button(LIFECYCLE_COPY.RETURN).click();
  const dialog = page.getByRole("dialog", { name: LIFECYCLE_COPY.RETURN });
  await expect(dialog).toContainText("ארכיון");
  await dialog.getByRole("button", { name: LIFECYCLE_COPY.CONFIRM_RETURN, exact: true }).click();
  await expect(page.getByText("הקובץ הועבר לארכיון", { exact: true })).toBeVisible({
    timeout: PUBLICATION_QA.ARCHIVE_MS,
  });
  await createQuotationPage(page).showDetails();
  await page.getByText("פרטים נוספים", { exact: true }).click();
  await expect(page.getByRole("heading", { name: "היסטוריית המסמך", exact: true })).toHaveCount(1);
  const timeline = page.getByRole("list").filter({ has: page.getByText(/^החזרה לעריכה ·/) });
  await expect(timeline).toHaveCount(1);
  await expect(timeline).toContainText("ארכיון");
  const historyLinks = timeline.getByRole("link");
  expect(await historyLinks.count()).toBeGreaterThan(0);
  for (const historyLink of await historyLinks.all()) {
    await expect(historyLink).toHaveAttribute("href", file ?? "Missing file");
  }
  await page.screenshot({
    path: info.outputPath("real-archive-existing-history.png"),
    fullPage: true,
    animations: "disabled",
  });
  await page.reload();
  await expect(page.getByText("הקובץ הועבר לארכיון", { exact: true })).toBeVisible();
});

test("pending polls every three seconds without a total cap and recovers read errors at ten seconds", async ({
  page,
  api,
}): Promise<void> => {
  const { quotation } = await seedQuotationForDeletion(api, QUOTATION.STATUS.REVIEW);
  const state = { requests: 0, fail: false };
  const current = {
    ...summary(quotation.version),
    state: PUBLICATION_STATE.RENDERING,
    canRetry: false,
    reason: null,
  };
  await page.clock.install();
  await page.route(`**/quotation/${quotation.id}/publication`, async (route): Promise<void> => {
    state.requests += 1;
    await route.fulfill(
      state.fail ? { status: 503, json: { message: "Unavailable" } } : { json: current },
    );
  });
  await createQuotationPage(page).goto(quotation.id);
  await expect(page.getByText(COPY.pending, { exact: true })).toBeVisible();
  for (const _ of Array.from({ length: 12 })) {
    const before = state.requests;
    await page.clock.fastForward(PUBLICATION_QA.POLL_MS);
    await expect.poll((): number => state.requests).toBe(before + 1);
  }
  state.fail = true;
  await page.clock.fastForward(PUBLICATION_QA.POLL_MS);
  await expect(page.getByText(COPY.readError, { exact: true })).toBeVisible();
  const before = state.requests;
  await page.clock.fastForward(PUBLICATION_QA.ERROR_POLL_MS - PUBLICATION_QA.POLL_MS / 3);
  expect(state.requests).toBe(before);
  state.fail = false;
  await page.clock.fastForward(PUBLICATION_QA.POLL_MS / 3);
  await expect.poll((): number => state.requests).toBe(before + 1);
  await expect(page.getByText(COPY.pending, { exact: true })).toBeVisible();
});

test("read-only quotation viewer sees published state and existing history without mutation or Drive metadata", async ({
  page,
  api,
}, info): Promise<void> => {
  test.setTimeout(PUBLICATION_QA.TEST_MS);
  const { quotation: draft, project } = await seedQuotationForDeletion(api, QUOTATION.STATUS.DRAFT);
  expect((await api.send(HTTP_METHODS.POST, `/project-drive/${project.id}/provision`)).ok()).toBe(
    true,
  );
  const quotation = await quotationDocument(
    await api.send(HTTP_METHODS.POST, `/quotation/${draft.id}/review`, {
      version: draft.version,
      status: QUOTATION.STATUS.REVIEW,
    }),
  );
  await expect
    .poll(
      async (): Promise<PublicationStateType> => (await readPublication(api, quotation.id)).state,
      {
        timeout: PUBLICATION_QA.RENDER_MS,
      },
    )
    .toBe(PUBLICATION_STATE.PUBLISHED);
  const prior = await readPublication(api, quotation.id);
  expect(prior.fileUrl).not.toBeNull();
  await withRolePermissions(
    USER_ROLES.SYSTEM_ADMIN,
    [PERMISSIONS.QUOTATIONS_READ],
    async (): Promise<void> => {
      await createQuotationPage(page).goto(quotation.id);
      await expect(
        page.getByRole("heading", { name: quotation.number, exact: true }),
      ).toBeVisible();
      await expect(page.getByText(COPY.published, { exact: true })).toBeVisible();
      await createQuotationPage(page).showDetails();
      await page.getByText("פרטים נוספים", { exact: true }).click();
      await expect(
        page.getByRole("heading", { name: LIFECYCLE_COPY.HISTORY, exact: true }),
      ).toBeVisible();
      const timeline = page.getByRole("list").filter({ has: page.getByText(/^שליחה לבדיקה ·/) });
      await expect(timeline).toHaveCount(1);
      await expect(timeline).toContainText(COPY.published);
      await expect(timeline).toContainText(api.session.user.firstName);
      await expect(timeline.getByRole("link")).toHaveCount(0);
      await expect(page.getByRole("button", { name: COPY.retry, exact: true })).toHaveCount(0);
      await expect(
        page.getByRole("link", { name: "פתיחת הקובץ (בחלון חדש)", exact: true }),
      ).toHaveCount(0);
      await expect(page.getByRole("button", { name: "אישור ההצעה", exact: true })).toHaveCount(0);
      await expect(
        page.getByText(prior.destinationLabel ?? "Missing original destination", { exact: true }),
      ).toHaveCount(0);
      await page.screenshot({
        path: info.outputPath("readonly-publication-history.png"),
        fullPage: true,
        animations: "disabled",
      });
    },
  );
});

test("project quotation details display actual published state and safe file navigation in the existing quotation surface", async ({
  page,
  api,
}, info): Promise<void> => {
  test.setTimeout(PUBLICATION_QA.TEST_MS);
  const fixture = await seedQuotationForDeletion(api, QUOTATION.STATUS.DRAFT);
  const project = await seedBuilding(api, fixture.customer);
  const draft = await saveQuotation(api, fixture.quotation.id, {
    ...quotationWrite(fixture.quotation),
    projectId: project.id,
  });
  expect((await api.send(HTTP_METHODS.POST, `/project-drive/${project.id}/provision`)).ok()).toBe(
    true,
  );
  const quotation = await quotationDocument(
    await api.send(HTTP_METHODS.POST, `/quotation/${draft.id}/review`, {
      version: draft.version,
      status: QUOTATION.STATUS.REVIEW,
    }),
  );
  await expect
    .poll(
      async (): Promise<PublicationStateType> => (await readPublication(api, quotation.id)).state,
      {
        timeout: PUBLICATION_QA.RENDER_MS,
      },
    )
    .toBe(PUBLICATION_STATE.PUBLISHED);
  const publication = await readPublication(api, quotation.id);
  await page.goto(`/projects/${project.id}`);
  const region = page.getByRole("region", { name: "הצעות מחיר", exact: true });
  await expect(region).toBeVisible();
  const row = region.getByRole("button", { name: new RegExp(quotation.number) });
  await expect(row).toHaveCount(1);
  await expect(row.getByText(COPY.published, { exact: true })).toBeVisible();
  await expect(row).toContainText(`גרסה ${publication.sourceVersion}`);
  await expect(row).toContainText(publication.destinationLabel ?? "Missing destination");
  const link = row.getByRole("link", { name: "פתיחת הקובץ (בחלון חדש)", exact: true });
  await expect(link).toHaveAttribute("href", publication.fileUrl ?? "Missing file");
  await expect(link).toHaveAttribute("rel", "noopener noreferrer");
  await expect(link).toHaveAttribute("target", "_blank");
  await page.screenshot({
    path: info.outputPath("project-publication-details.png"),
    fullPage: true,
    animations: "disabled",
  });
});

test("account switch discards a delayed retry result and keeps the next account summary", async ({
  page,
  api,
}): Promise<void> => {
  const { quotation } = await seedQuotationForDeletion(api, QUOTATION.STATUS.REVIEW);
  const nextUser = await seedUser(api, USER_ROLES.SYSTEM_ADMIN);
  const first = summary(quotation.version);
  const second = {
    ...first,
    cycleId: randomUUID(),
    state: PUBLICATION_STATE.NOT_APPLICABLE,
    canRetry: false,
    reason: null,
    destinationLabel: null,
  };
  const state = { current: first };
  const release = createDeferred();
  await page.route(`**/quotation/${quotation.id}/publication`, (route): Promise<void> =>
    route.fulfill({ json: state.current }),
  );
  await page.route(
    `**/quotation/${quotation.id}/publication/retry`,
    async (route): Promise<void> => {
      await release.promise;
      await route.fulfill({
        json: {
          ...first,
          state: PUBLICATION_STATE.PUBLISHED,
          canRetry: false,
          fileUrl: "https://drive.google.com/open?id=old-account-file",
        },
      });
    },
  );
  const editor = createQuotationPage(page);
  await editor.goto(quotation.id);
  await page.getByRole("button", { name: COPY.retry, exact: true }).click();
  await createAppShell(page).logoutButton.click();
  const login = createLoginPage(page);
  await expect(login.heading).toBeVisible();
  state.current = { ...first, ...second, destinationLabel: "" };
  await login.login(nextUser);
  await expect(page).toHaveURL(ROUTES.BOARD);
  await editor.goto(quotation.id);
  await expect(
    page.getByText("אין פרויקט מקושר לשמירת הקובץ ב-Drive", { exact: true }),
  ).toBeVisible();
  release.resolve();
  await expect(page.getByText(COPY.published, { exact: true })).toHaveCount(0);
  await expect(
    page.getByRole("link", { name: "פתיחת הקובץ (בחלון חדש)", exact: true }),
  ).toHaveCount(0);
  await expect(page.getByRole("button", { name: COPY.retry, exact: true })).toHaveCount(0);
});

for (const outcome of Object.values(PUBLICATION_FOCUS_OUTCOME)) {
  test(`retry ${outcome} preserves meaningful keyboard focus without stealing user movement`, async ({
    page,
    api,
  }): Promise<void> => {
    const { quotation } = await seedQuotationForDeletion(api, QUOTATION.STATUS.REVIEW);
    const initial = summary(quotation.version);
    const state = { current: initial };
    await page.route(`**/quotation/${quotation.id}/publication`, (route): Promise<void> =>
      route.fulfill({ json: state.current }),
    );
    await page.route(`**/quotation/${quotation.id}/publication/retry`, (route): Promise<void> =>
      route.fulfill({
        json: { ...initial, state: PUBLICATION_STATE.RENDERING, canRetry: false, reason: null },
      }),
    );
    await createQuotationPage(page).goto(quotation.id);
    const retry = page.getByRole("button", { name: COPY.retry, exact: true });
    await retry.focus();
    await retry.press("Enter");
    await expect(page.getByText(COPY.pending, { exact: true })).toBeVisible();
    await expect(retry).toBeFocused();
    const other = page.getByRole("button", { name: LIFECYCLE_COPY.RETURN, exact: true });
    if (outcome === PUBLICATION_FOCUS_OUTCOME.MOVED) {
      await other.focus();
      await expect(other).toBeFocused();
    }
    state.current = {
      ...initial,
      state:
        outcome === PUBLICATION_FOCUS_OUTCOME.FAILURE
          ? PUBLICATION_STATE.FAILED
          : PUBLICATION_STATE.PUBLISHED,
      canRetry: outcome === PUBLICATION_FOCUS_OUTCOME.FAILURE,
    };
    if (outcome === PUBLICATION_FOCUS_OUTCOME.FAILURE) {
      await expect(retry).toBeEnabled();
      await expect(retry).toBeFocused();
      return;
    }

    await expect(page.getByText(COPY.published, { exact: true })).toBeVisible();
    await expect(retry).toHaveCount(0);
    if (outcome === PUBLICATION_FOCUS_OUTCOME.MOVED) {
      await expect(other).toBeFocused();
      return;
    }

    await expect(page.getByText(COPY.published, { exact: true })).toBeFocused();
  });
}

for (const archivedReason of [null, "ההפקה בוטלה לפני יצירת קובץ"]) {
  test(`archived notice respects safe reason ${archivedReason ?? "verified archive with redacted URL"}`, async ({
    page,
    api,
  }): Promise<void> => {
    const { quotation } = await seedQuotationForDeletion(api, QUOTATION.STATUS.REVIEW);
    const current = {
      ...summary(quotation.version),
      state: PUBLICATION_STATE.ARCHIVED,
      reason: archivedReason,
      canRetry: false,
      fileUrl: null,
    };
    await page.route(`**/quotation/${quotation.id}/publication`, (route): Promise<void> =>
      route.fulfill({ json: current }),
    );
    await createQuotationPage(page).goto(quotation.id);
    const expected = archivedReason ?? "הקובץ הועבר לארכיון";
    await expect(page.getByText(expected, { exact: true })).toBeVisible();
    const absent = archivedReason === null ? "ההפקה בוטלה לפני יצירת קובץ" : "הקובץ הועבר לארכיון";
    await expect(page.getByText(absent, { exact: true })).toHaveCount(0);
    await expect(
      page.getByRole("link", { name: "פתיחת הקובץ (בחלון חדש)", exact: true }),
    ).toHaveCount(0);
  });
}
