import { randomUUID } from "node:crypto";
import { test, expect } from "../../src/fixtures/test.fixture.ts";
import { HTTP_METHODS } from "../../src/constants/http.constant.ts";
import { USER_ROLES } from "../../src/constants/user-role.constant.ts";
import { TEST_USERS } from "../../src/constants/test-users.constant.ts";
import { createQuotationPage } from "../../src/pages/quotation.page.ts";
import { quotationBox } from "../../src/utilities/quotation-layout.utility.ts";
import { withRolePermissions } from "../../src/environment/role-permissions.ts";
import { quotationDocument, quotationWrite } from "../../src/api/quotation.api.ts";
import { seedQuotationForDeletion } from "../../src/api/quotation-delete-fixture.ts";
import { QUOTATION, QUOTATION_PERMISSIONS } from "../../src/constants/quotation.constant.ts";

test("only admin or engineering lead can reject with a reason; engineer corrects and resubmits", async ({
  api,
  apiAs,
}): Promise<void> => {
  const { quotation } = await seedQuotationForDeletion(api, QUOTATION.STATUS.REVIEW);
  const path = `/quotation/${quotation.id}`;
  const engineer = await apiAs(TEST_USERS[USER_ROLES.ENGINEER]);
  const lead = await apiAs(TEST_USERS[USER_ROLES.ENGINEERING_LEAD]);
  const reason = `Fix total ${randomUUID()}`;
  for (const input of [
    { version: quotation.version },
    { version: quotation.version, reason: "   " },
  ]) {
    expect((await lead.send(HTTP_METHODS.POST, `${path}/reject`, input)).status()).toBe(400);
  }
  expect(
    (
      await engineer.send(HTTP_METHODS.POST, `${path}/reject`, {
        version: quotation.version,
        reason,
      })
    ).status(),
  ).toBe(403);
  await withRolePermissions(
    USER_ROLES.ENGINEER,
    [QUOTATION_PERMISSIONS.APPROVE],
    async (): Promise<void> => {
      expect(
        (
          await engineer.send(HTTP_METHODS.POST, `${path}/reject`, {
            version: quotation.version,
            reason,
          })
        ).status(),
      ).toBe(403);
    },
  );
  const rejected = await quotationDocument(
    await lead.send(HTTP_METHODS.POST, `${path}/reject`, {
      version: quotation.version,
      reason: `  ${reason}  `,
    }),
  );
  expect(rejected).toMatchObject({
    id: quotation.id,
    number: quotation.number,
    status: QUOTATION.STATUS.DRAFT,
    version: quotation.version + 1,
  });
  expect(rejected.rejectionHistory).toHaveLength(1);
  expect(rejected.rejectionHistory[0]).toMatchObject({
    reason,
    rejectedById: lead.session.user.id,
    resubmittedAt: null,
  });
  expect(
    (
      await api.send(HTTP_METHODS.POST, `${path}/review`, {
        version: rejected.version,
        status: QUOTATION.STATUS.REVIEW,
      })
    ).status(),
  ).toBe(409);
  const corrected = await quotationDocument(
    await engineer.send(HTTP_METHODS.PUT, path, {
      ...quotationWrite(rejected),
      internalNotes: "Engineering correction checked",
    }),
  );
  expect(corrected.status).toBe(QUOTATION.STATUS.DRAFT);
  expect(corrected.rejectionHistory[0]?.reason).toBe(reason);
  expect(
    (
      await engineer.send(HTTP_METHODS.POST, `${path}/resubmit`, { version: rejected.version })
    ).status(),
  ).toBe(409);
  const resubmitted = await quotationDocument(
    await engineer.send(HTTP_METHODS.POST, `${path}/resubmit`, { version: corrected.version }),
  );
  expect(resubmitted).toMatchObject({
    id: quotation.id,
    number: quotation.number,
    status: QUOTATION.STATUS.REVIEW,
    version: corrected.version + 1,
  });
  expect(resubmitted.rejectionHistory[0]).toMatchObject({
    reason,
    resubmittedById: engineer.session.user.id,
  });
  expect(resubmitted.rejectionHistory[0]?.resubmittedAt).toBeTruthy();
  expect(
    (
      await engineer.send(HTTP_METHODS.POST, `${path}/resubmit`, { version: resubmitted.version })
    ).status(),
  ).toBe(409);
  const adminRejection = await quotationDocument(
    await api.send(HTTP_METHODS.POST, `${path}/reject`, {
      version: resubmitted.version,
      reason: "Admin review correction",
    }),
  );
  expect(adminRejection.status).toBe(QUOTATION.STATUS.DRAFT);
  expect(adminRejection.rejectionHistory).toHaveLength(2);
  expect(adminRejection.rejectionHistory[1]).toMatchObject({
    reason: "Admin review correction",
    rejectedById: api.session.user.id,
    resubmittedAt: null,
  });
});

test("reviewer rejects in the page and engineer sees the correction, edits, and resubmits", async ({
  api,
  openPageAs,
}): Promise<void> => {
  const { quotation } = await seedQuotationForDeletion(api, QUOTATION.STATUS.REVIEW);
  const reason = `Please correct ${randomUUID()}`;
  const leadPage = await openPageAs(TEST_USERS[USER_ROLES.ENGINEERING_LEAD]);
  const leadQuote = createQuotationPage(leadPage);
  await leadQuote.goto(quotation.id);
  await expect(leadQuote.button("דחייה עם סיבה")).toBeVisible();
  await leadQuote.button("דחייה עם סיבה").click();
  const dialog = leadPage.getByRole("dialog", { name: "דחיית הצעה והחזרה לתיקון" });
  await expect(dialog.getByRole("button", { name: "דחה והחזר לתיקון" })).toBeDisabled();
  await dialog.getByRole("textbox", { name: "סיבת דחייה" }).fill(reason);
  const rejection = leadPage.waitForResponse(
    (response): boolean =>
      response.url().endsWith(`/quotation/${quotation.id}/reject`) &&
      response.request().method() === HTTP_METHODS.POST,
  );
  await dialog.getByRole("button", { name: "דחה והחזר לתיקון" }).click();
  expect((await rejection).status()).toBe(201);
  await expect(dialog).toHaveCount(0);
  await expect(leadPage.getByText("נדרש תיקון", { exact: true }).first()).toBeVisible();
  await expect(leadPage.getByRole("alert").getByText(reason, { exact: true })).toBeVisible();
  await leadPage.goto(`/projects/${quotation.projectId}?tab=quotations`);
  await expect(
    leadPage.getByRole("button", { name: new RegExp(quotation.number) }),
  ).toHaveAccessibleName(/נדרש תיקון/);

  const engineerPage = await openPageAs(TEST_USERS[USER_ROLES.ENGINEER]);
  const engineerQuote = createQuotationPage(engineerPage);
  await engineerQuote.goto(quotation.id);
  await expect(engineerQuote.button("דחייה עם סיבה")).toHaveCount(0);
  await expect(engineerPage.getByRole("alert").getByText(reason, { exact: true })).toBeVisible();
  await createQuotationPage(engineerPage).showDetails();
  await engineerPage.getByText("פרטים נוספים", { exact: true }).click();
  const timeline = engineerPage
    .getByRole("list")
    .filter({ has: engineerPage.getByText(reason, { exact: true }) });
  await expect(timeline).toHaveCount(1);
  await expect(timeline.getByText(reason, { exact: true })).toBeVisible();
  const save = engineerPage.waitForResponse(
    (response): boolean =>
      response.url().endsWith(`/quotation/${quotation.id}`) &&
      response.request().method() === HTTP_METHODS.PUT,
  );
  await engineerQuote.field("הערות פנימיות (לא יופיעו ללקוח)").fill("Corrected after review");
  expect((await save).status()).toBe(200);
  await expect(engineerPage.getByRole("alert").getByText(reason, { exact: true })).toBeVisible();
  const resubmit = engineerPage.waitForResponse(
    (response): boolean =>
      response.url().endsWith(`/quotation/${quotation.id}/resubmit`) &&
      response.request().method() === HTTP_METHODS.POST,
  );
  await engineerQuote.button("שליחה מחדש לבדיקה").click();
  expect((await resubmit).status()).toBe(201);
  await expect(engineerPage.getByText("בבדיקה", { exact: true }).first()).toBeVisible();
  await expect(engineerQuote.button("שליחה מחדש לבדיקה")).toHaveCount(0);
  const durable = await quotationDocument(
    await api.send(HTTP_METHODS.GET, `/quotation/${quotation.id}`),
  );
  expect(durable.internalNotes).toBe("Corrected after review");
  expect(durable.rejectionHistory[0]?.reason).toBe(reason);
  expect(durable.rejectionHistory[0]?.resubmittedAt).toBeTruthy();
});

test("quotation header keeps a top-left trash action, simpler context and two footer cards", async ({
  page,
  api,
}): Promise<void> => {
  const { quotation } = await seedQuotationForDeletion(api, QUOTATION.STATUS.DRAFT);
  const quote = createQuotationPage(page);
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 900 });
    await quote.goto(quotation.id);
    const trash = quote.button("מחיקת ההצעה");
    await expect(trash).toBeVisible();
    const box = await quotationBox(trash);
    const heading = await quotationBox(
      page.getByRole("heading", { name: quotation.number, exact: true }),
    );
    expect(box.width).toBeGreaterThanOrEqual(44);
    expect(box.height).toBeGreaterThanOrEqual(44);
    expect(box.x).toBeLessThan(heading.x);
    await expect(page.locator("span[data-active]")).toHaveCount(0);
    await quote.showDetails();
    await expect(page.getByText("פרטים נוספים", { exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: "בדיקה ואישור" })).toBeVisible();
    expect(
      await page.evaluate((): boolean => document.documentElement.scrollWidth <= innerWidth),
    ).toBe(true);
  }
  await quote.button("מחיקת ההצעה").click();
  const dialog = page.getByRole("dialog", { name: "מחיקת הצעה" });
  await expect(dialog).toContainText(quotation.number);
  await dialog.getByRole("button", { name: "חזרה" }).click();
  await expect(dialog).toHaveCount(0);
  expect(
    (await quotationDocument(await api.send(HTTP_METHODS.GET, `/quotation/${quotation.id}`)))
      .version,
  ).toBe(quotation.version);
});
