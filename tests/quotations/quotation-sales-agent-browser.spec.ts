import {
  quotationBox,
  expectQuotationWithinViewport,
} from "../../src/utilities/quotation-layout.utility.ts";

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

test("quotation creator selects an engineer, changes to admin and clears it", async ({
  page,
  api,
}) => {
  const customer = await api.createCustomer({
    ...buildCustomerInput(),
    paymentTerms: PAYMENT_TERMS.PREPAID,
  });
  const first = await seedUser(api, USER_ROLES.ENGINEER);
  const second = await seedUser(api, USER_ROLES.SYSTEM_ADMIN);
  const quote = createQuotationPage(page);

  await page.goto("/quotations");
  await quote.button("הצעה חדשה").click();
  await quote.chooseEntity("לקוח *", customer.name);
  const agentPicker = page.getByRole("combobox", { name: PICKER }).first();
  const clientPicker = page.getByRole("combobox", { name: "לקוח *" }).first();
  const [agentBox, clientBox] = await Promise.all([
    quotationBox(agentPicker),
    quotationBox(clientPicker),
  ]);
  expect(agentBox.height).toBe(clientBox.height);
  expect(await agentPicker.evaluate(element => getComputedStyle(element).borderRadius)).toBe(
    await clientPicker.evaluate(element => getComputedStyle(element).borderRadius),
  );
  for (const property of ["height", "borderRadius", "backgroundColor", "boxShadow"] as const) {
    expect(
      await agentPicker
        .locator("..")
        .evaluate((element, key) => getComputedStyle(element)[key], property),
    ).toBe(
      await clientPicker
        .locator("..")
        .evaluate((element, key) => getComputedStyle(element)[key], property),
    );
  }
  await agentPicker.click();
  const agentOption = page.getByRole("option", { name: new RegExp(first.firstName) });
  await expect(agentOption).toBeVisible();
  const employeeNumber = (await agentOption.textContent())?.split("·").at(-1)?.trim() ?? "";
  expect(employeeNumber).not.toBe("");
  await agentPicker.fill("missing-agent-name");
  await expect(page.getByText("לא נמצאו תוצאות", { exact: true })).toBeVisible();
  await agentPicker.fill(employeeNumber);
  await expect(agentOption).toContainText(employeeNumber);
  await agentPicker.press("ArrowDown");
  await agentPicker.press("Enter");
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
  await agentPicker.hover();
  await page
    .locator(".MuiAutocomplete-root")
    .filter({ has: agentPicker })
    .getByRole("button", { name: "נקה בחירה" })
    .click();
  expect((await cleared).status()).toBe(200);
  await page.reload();
  await expect(page.getByRole("combobox", { name: PICKER }).first()).toHaveValue("");
  expect(
    (await quotationDocument(await api.send(HTTP_METHODS.GET, `/quotation/${id}`))).salesAgentId,
  ).toBeNull();
  await page.setViewportSize({ width: 390, height: 844 });
  await expectQuotationWithinViewport(page, [agentPicker, clientPicker]);
  await agentPicker.focus();
  await expect(page.getByRole("listbox")).toBeVisible();
  await expectQuotationWithinViewport(page, [page.getByRole("listbox")]);
  await agentPicker.press("Escape");
  await expect(page.getByRole("listbox")).toHaveCount(0);
});

test("quotation editor hides employee selection from a quotation-only user while retaining the saved name", async ({
  api,
  openPageAs,
}) => {
  const customer = await api.createCustomer({
    ...buildCustomerInput(),
    paymentTerms: PAYMENT_TERMS.PREPAID,
  });
  const agent = await seedUser(api, USER_ROLES.ENGINEER);
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

test("quotation editor preserves a former agent name and retries a failed agent search", async ({
  page,
  api,
}) => {
  const customer = await api.createCustomer(buildCustomerInput());
  const agent = await seedUser(api, USER_ROLES.ENGINEER);
  const created = await quotationDocument(
    await api.send(HTTP_METHODS.POST, "/quotation", {
      customerId: customer.id,
      salesAgentId: agent.id,
    }),
  );
  expect(
    (
      await api.send(HTTP_METHODS.PATCH, `/user/${agent.id}`, {
        assignedRoles: [USER_ROLES.INSTALLER],
      })
    ).status(),
  ).toBe(200);
  await page.goto(`/quotations/${created.id}`);
  const picker = page.getByRole("combobox", { name: PICKER }).first();
  await expect(picker).toHaveValue(new RegExp(`${agent.firstName}.*לא זמין`));
  await picker.focus();
  await expect(page.getByRole("option", { name: new RegExp(agent.firstName) })).toHaveCount(0);
  await picker.press("Escape");

  await page.route("**/quotation/sales-agents", route => route.fulfill({ status: 500 }));
  await page.reload();
  await expect(page.getByRole("alert")).toBeVisible();
  await page.unroute("**/quotation/sales-agents");
  await page.getByRole("button", { name: "נסה שוב" }).click();
  await expect(page.getByRole("alert")).toHaveCount(0);
  await expect(picker).toHaveValue(new RegExp(`${agent.firstName}.*לא זמין`));
});
