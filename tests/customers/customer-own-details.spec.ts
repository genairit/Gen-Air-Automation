import type { Page } from "@playwright/test";
import { test, expect } from "../../src/fixtures/test.fixture.ts";
import { HTTP_METHODS } from "../../src/constants/http.constant.ts";
import { findCardByTitle } from "../../src/pages/card.component.ts";
import { findFieldByTitle } from "../../src/pages/field.component.ts";
import { USER_ROLES } from "../../src/constants/user-role.constant.ts";
import { TEST_USERS } from "../../src/constants/test-users.constant.ts";
import { createCustomerFormPage } from "../../src/pages/customers.page.ts";
import { readLastPathSegment } from "../../src/utilities/route.utility.ts";
import { readHorizontalOverflow } from "../../src/pages/layout.component.ts";
import { buildCustomerInput, seedCustomer } from "../../src/api/seed-data.ts";
import { readCustomerOwnDetails } from "../../src/api/customer-own-details.api.ts";
import { CUSTOMER_OWN_DETAILS as COPY } from "../../src/constants/customer-own-details.constant.ts";

const ownDetailsCard = (page: Page) => findCardByTitle(page, COPY.TITLE);

const fillIdentity = async (page: Page, input: ReturnType<typeof buildCustomerInput>) => {
  const form = createCustomerFormPage(page);
  await form.field("NAME").fill(input.name);
  await form.field("TAX_ID").fill(input.taxId);
  await form.field("ADDRESS").fill(input.address);
};

test("customer creation uses direct own email or international phone, never an arbitrary directory person", async ({
  page,
  api,
}) => {
  const unrelated = await api.send(HTTP_METHODS.POST, "/contact-directory", {
    name: "Unrelated customer directory person",
    phone: COPY.LEGACY_PHONE,
    email: "unrelated@example.test",
  });
  expect(unrelated.ok()).toBe(true);
  for (const details of [
    { phone: "", email: "own-customer@example.test" },
    { phone: COPY.PHONE_VALUE, email: "" },
  ]) {
    const input = buildCustomerInput();
    const form = createCustomerFormPage(page);
    await form.goto();
    await fillIdentity(page, input);
    await expect(page.getByRole("textbox", { name: "שם איש הקשר", exact: true })).toHaveCount(0);
    await expect(page.getByPlaceholder("שם, טלפון או דוא״ל")).toHaveCount(0);
    await form.field("PHONE").fill(details.phone);
    await form.field("EMAIL").fill(details.email);
    await form.saveButton.click();
    await form.skipProjects();
    const id = readLastPathSegment(page.url());
    const card = ownDetailsCard(page);
    await expect(card).toBeVisible();
    await expect(card.getByText(COPY.PHONE, { exact: true })).toBeVisible();
    await expect(card.getByText(COPY.EMAIL, { exact: true })).toBeVisible();
    await expect(card.getByText("Unrelated customer directory person")).toHaveCount(0);
    expect((await readCustomerOwnDetails(api, id)).primaryContact).toMatchObject({
      name: input.name,
      phone: details.phone || null,
      email: details.email || null,
    });
    await page.reload();
    await expect(card).toBeVisible();
    if (details.phone) {
      await expect(card.locator(`a[href="${COPY.PHONE_HREF}"]`)).toBeVisible();
    }

    if (details.email) {
      await expect(card.locator(`a[href="mailto:${details.email}"]`)).toBeVisible();
    }
  }
});

test("customer own-details edit preserves failed drafts, retries, cancels and clears independently at 390px", async ({
  page,
  api,
}, testInfo) => {
  const customer = await seedCustomer(api);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`/customers/${customer.id}`);
  const card = ownDetailsCard(page);
  await card.getByRole("button", { name: COPY.EDIT, exact: true }).click();
  const phone = findFieldByTitle(card, COPY.PHONE);
  const email = findFieldByTitle(card, COPY.EMAIL);
  await phone.fill(COPY.PHONE_VALUE);
  await email.fill("changed-own@example.test");
  await email.press("Tab");
  expect(await readHorizontalOverflow(page)).toBe(0);
  await page.route(
    `**/api/customer/${customer.id}`,
    async route => {
      if (route.request().method() !== HTTP_METHODS.PATCH) {
        await route.continue();
        return;
      }

      await route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({ message: "QA own-details temporary failure" }),
      });
    },
    { times: 1 },
  );
  await card.getByRole("button", { name: COPY.SAVE, exact: true }).click();
  await expect(card.getByRole("alert")).toBeVisible();
  await expect(phone).toHaveValue(COPY.PHONE_VALUE);
  await expect(email).toHaveValue("changed-own@example.test");
  await card.getByRole("button", { name: COPY.SAVE, exact: true }).click();
  await expect(card.locator(`a[href="${COPY.PHONE_HREF}"]`)).toBeVisible();
  await page.reload();
  expect((await readCustomerOwnDetails(api, customer.id)).primaryContact).toMatchObject({
    phone: COPY.PHONE_VALUE,
    email: "changed-own@example.test",
  });
  await card.getByRole("button", { name: COPY.EDIT, exact: true }).click();
  await phone.fill("+44123");
  await expect(card.getByRole("button", { name: COPY.SAVE, exact: true })).toBeDisabled();
  await expect(phone).toHaveValue("+44123");
  await card.getByRole("button", { name: COPY.CANCEL, exact: true }).click();
  await expect(card.locator(`a[href="${COPY.PHONE_HREF}"]`)).toBeVisible();
  await card.getByRole("button", { name: COPY.EDIT, exact: true }).click();
  await phone.fill("");
  await card.getByRole("button", { name: COPY.SAVE, exact: true }).click();
  await expect(card.locator('a[href="mailto:changed-own@example.test"]')).toBeVisible();
  await page.reload();
  expect((await readCustomerOwnDetails(api, customer.id)).primaryContact).toMatchObject({
    phone: null,
    email: "changed-own@example.test",
  });
  expect(await readHorizontalOverflow(page)).toBe(0);
  await page.screenshot({
    path: testInfo.outputPath("customer-own-details-mobile.png"),
    fullPage: true,
  });
});

test("read-only customer viewers see own details without edit controls", async ({
  api,
  openPageAs,
}) => {
  const customer = await seedCustomer(api);
  const page = await openPageAs(TEST_USERS[USER_ROLES.FINANCE]);
  await page.goto(`/customers/${customer.id}`);
  const card = ownDetailsCard(page);
  await expect(card).toBeVisible();
  await expect(card.getByRole("button", { name: COPY.EDIT, exact: true })).toHaveCount(0);
  await expect(card.getByText(COPY.PHONE, { exact: true })).toBeVisible();
  await expect(card.getByText(COPY.EMAIL, { exact: true })).toBeVisible();
});
