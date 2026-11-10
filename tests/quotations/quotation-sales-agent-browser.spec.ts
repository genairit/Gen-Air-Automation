import type { Page } from "@playwright/test";
import { test, expect } from "../../src/fixtures/test.fixture.ts";
import { quotationDocument } from "../../src/api/quotation.api.ts";
import { HTTP_METHODS } from "../../src/constants/http.constant.ts";
import { PAYMENT_TERMS } from "../../src/constants/domain.constant.ts";
import { USER_ROLES } from "../../src/constants/user-role.constant.ts";
import { TEST_USERS } from "../../src/constants/test-users.constant.ts";
import { createQuotationPage } from "../../src/pages/quotation.page.ts";
import { PERMISSIONS } from "../../src/constants/permission.constant.ts";
import { seedUser, buildCustomerInput } from "../../src/api/seed-data.ts";
import { withRolePermissions } from "../../src/environment/role-permissions.ts";

const PICKER = "סוכן מכירות (אופציונלי)";

const chooseSalesAgent = async (page: Page, firstName: string): Promise<void> => {
  await page.getByRole("combobox", { name: PICKER }).first().click();
  await page.getByRole("option", { name: new RegExp(firstName) }).click();
};

test("quotation creator selects a sales employee, changes and clears it, and reload preserves each result", async ({
  page,
  api,
}) => {
  const customer = await api.createCustomer({
    ...buildCustomerInput(),
    paymentTerms: PAYMENT_TERMS.PREPAID,
  });
  const first = await seedUser(api, USER_ROLES.SALES_AGENT);
  const second = await seedUser(api, USER_ROLES.SALES_AGENT);
  const quote = createQuotationPage(page);

  await page.goto("/quotations");
  await quote.button("הצעה חדשה").click();
  await quote.chooseEntity("לקוח *", customer.name);
  await chooseSalesAgent(page, first.firstName);
  await expect(page.getByRole("combobox", { name: PICKER }).first()).toHaveValue(
    new RegExp(first.firstName),
  );
  await quote.button("יצירת הצעה").click();
  await expect(page).toHaveURL(/\/quotations\/[\w-]+$/);
  const id = new URL(page.url()).pathname.split("/").at(-1)!;
  expect(
    (await quotationDocument(await api.send(HTTP_METHODS.GET, `/quotation/${id}`))).salesAgentId,
  ).toBe(first.id);

  await page.reload();
  await expect(page.getByRole("combobox", { name: PICKER }).first()).toHaveValue(
    new RegExp(first.firstName),
  );
  const changed = page.waitForResponse(
    response =>
      response.request().method() === HTTP_METHODS.PUT &&
      new URL(response.url()).pathname.endsWith(`/quotation/${id}`),
  );
  await chooseSalesAgent(page, second.firstName);
  expect((await changed).status()).toBe(200);
  await page.reload();
  await expect(page.getByRole("combobox", { name: PICKER }).first()).toHaveValue(
    new RegExp(second.firstName),
  );
  expect(
    (await quotationDocument(await api.send(HTTP_METHODS.GET, `/quotation/${id}`))).salesAgentId,
  ).toBe(second.id);

  const cleared = page.waitForResponse(
    response =>
      response.request().method() === HTTP_METHODS.PUT &&
      new URL(response.url()).pathname.endsWith(`/quotation/${id}`),
  );
  await page
    .getByRole("combobox", { name: PICKER })
    .first()
    .locator("..")
    .locator("..")
    .getByRole("button", { name: "נקה בחירה" })
    .click();
  expect((await cleared).status()).toBe(200);
  await page.reload();
  await expect(page.getByRole("combobox", { name: PICKER }).first()).toHaveValue("");
  expect(
    (await quotationDocument(await api.send(HTTP_METHODS.GET, `/quotation/${id}`))).salesAgentId,
  ).toBeNull();
});

test("quotation editor hides employee selection from a quotation-only user while retaining the saved name", async ({
  api,
  openPageAs,
}) => {
  const customer = await api.createCustomer({
    ...buildCustomerInput(),
    paymentTerms: PAYMENT_TERMS.PREPAID,
  });
  const agent = await seedUser(api, USER_ROLES.SALES_AGENT);
  const created = await quotationDocument(
    await api.send(HTTP_METHODS.POST, "/quotation", {
      customerId: customer.id,
      salesAgentId: agent.id,
    }),
  );
  await withRolePermissions(
    USER_ROLES.ENGINEER,
    [PERMISSIONS.QUOTATIONS_READ, PERMISSIONS.QUOTATIONS_UPDATE],
    async () => {
      const page = await openPageAs(TEST_USERS[USER_ROLES.ENGINEER]);
      await page.goto(`/quotations/${created.id}`);
      await expect(page.getByRole("combobox", { name: PICKER }).first()).toBeDisabled();
      await expect(page.getByRole("combobox", { name: PICKER }).first()).toHaveValue(
        new RegExp(agent.firstName),
      );
      await page.close();
    },
  );
});
