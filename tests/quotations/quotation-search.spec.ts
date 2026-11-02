import {
  seedCustomer,
  buildCustomerInput,
  seedStandaloneProject,
} from "../../src/api/seed-data.ts";

import { randomUUID } from "node:crypto";
import { isRecord } from "../../src/utilities/guard.utility.ts";
import { test, expect } from "../../src/fixtures/test.fixture.ts";
import { HTTP_METHODS } from "../../src/constants/http.constant.ts";
import { createQuotationPage } from "../../src/pages/quotation.page.ts";
import { KEYBOARD_KEYS } from "../../src/constants/keyboard.constant.ts";
import { createDeferred } from "../../src/utilities/deferred.utility.ts";
import { isCustomer } from "../../src/utilities/entity-guard.utility.ts";
import { createQuotation, quotationDocument } from "../../src/api/quotation.api.ts";

const CUSTOMER = "לקוח *";
const PROJECT = "פרויקט (אופציונלי)";
const NO_RESULTS = "לא נמצאו תוצאות";
const readQuotation = async (api: Parameters<typeof createQuotation>[0], id: string) =>
  quotationDocument(await api.send(HTTP_METHODS.GET, `/quotation/${id}`));

const orderedCustomers = async (api: Parameters<typeof createQuotation>[0], name: string) => {
  const response = await api.send(
    HTTP_METHODS.GET,
    `/customer?search=${encodeURIComponent(name)}&batchSize=200`,
  );
  expect(response.ok()).toBe(true);
  const body: unknown = await response.json();
  if (!isRecord(body) || !Array.isArray(body.items) || !body.items.every(isCustomer)) {
    throw new Error("Customer search did not return valid customer records");
  }

  return body.items;
};

const waitSearch = (page: Parameters<typeof createQuotationPage>[0], text: string) =>
  page.waitForResponse(response => {
    const url = new URL(response.url());
    return url.searchParams.get("search") === text;
  });

test("direct customer search preserves typed queries across loading and empty results and selects duplicate names by ID", async ({
  page,
  api,
}, testInfo) => {
  const customer = await seedCustomer(api);
  await api.createCustomer({ ...buildCustomerInput(), name: customer.name });
  const ordered = await orderedCustomers(api, customer.name);
  expect(ordered).toHaveLength(2);
  const targetIndex = ordered.findIndex(row => row.id !== customer.id);
  expect(targetIndex).toBeGreaterThanOrEqual(0);
  const target = ordered[targetIndex]!;
  const initial = await createQuotation(api, customer.id);
  const quote = createQuotationPage(page);
  const duplicateWarnings: string[] = [];
  page.on("console", message => {
    if (/same key|unique.*key/i.test(message.text())) {
      duplicateWarnings.push(message.text());
    }
  });
  await quote.goto(initial.id);
  await expect(quote.field(CUSTOMER)).toHaveValue(customer.name);
  await expect(page.locator("details")).toHaveCount(0);
  const gate = createDeferred();
  await page.route("**/api/customer?*", async route => {
    if (new URL(route.request().url()).searchParams.get("search") === customer.name) {
      await gate.promise;
    }

    await route.continue();
  });
  try {
    const searched = waitSearch(page, customer.name);
    await quote.field(CUSTOMER).fill("");
    await quote.field(CUSTOMER).fill(customer.name);
    await expect(page.getByText("טוען אפשרויות...", { exact: true })).toBeVisible();
    await expect(quote.field(CUSTOMER)).toHaveValue(customer.name);
    gate.resolve();
    expect((await searched).status()).toBe(200);
    const options = page.getByRole("option", { name: customer.name, exact: true });
    await expect(options).toHaveCount(2);
    await quote.saved(() => options.nth(targetIndex).click());
    expect((await readQuotation(api, initial.id)).customerId).toBe(target.id);
    expect(duplicateWarnings).toEqual([]);
    const saved = await readQuotation(api, initial.id);
    const missing = `missing-${randomUUID()}`;
    const absent = waitSearch(page, missing);
    await quote.field(CUSTOMER).fill(missing);
    expect((await absent).status()).toBe(200);
    await expect(page.getByText(NO_RESULTS, { exact: true })).toBeVisible();
    await expect(quote.field(CUSTOMER)).toHaveValue(missing);
    const continued = waitSearch(page, `${missing}a`);
    await quote.field(CUSTOMER).pressSequentially("a");
    expect((await continued).status()).toBe(200);
    await expect(quote.field(CUSTOMER)).toHaveValue(`${missing}a`);
    await quote.field(CUSTOMER).press(KEYBOARD_KEYS.ESCAPE);
    await expect(quote.field(CUSTOMER)).toHaveValue(target.name);
    expect((await readQuotation(api, initial.id)).version).toBe(saved.version);
    await page.screenshot({
      path: testInfo.outputPath("direct-customer-search.png"),
      fullPage: true,
    });
  } finally {
    gate.resolve();
    await page.unroute("**/api/customer?*");
  }
});

test("project search stays customer scoped, retains active typing, selects with keyboard and clears the optional link durably", async ({
  page,
  api,
}, testInfo) => {
  const customer = await seedCustomer(api);
  const project = await seedStandaloneProject(api, customer);
  const foreignCustomer = await seedCustomer(api);
  const foreignProject = await seedStandaloneProject(api, foreignCustomer);
  const initial = await createQuotation(api, customer.id);
  const quote = createQuotationPage(page);
  await quote.goto(initial.id);
  const field = quote.field(PROJECT);
  await expect(field).toBeVisible();
  await field.click();
  await expect(page.getByRole("option", { name: project.name, exact: true })).toBeVisible();
  await expect(page.getByRole("option", { name: foreignProject.name, exact: true })).toHaveCount(0);
  await field.fill(project.name);
  await expect(page.getByRole("option", { name: project.name, exact: true })).toBeVisible();
  await field.press(KEYBOARD_KEYS.ARROW_DOWN);
  await quote.saved(() => field.press(KEYBOARD_KEYS.ENTER));
  expect((await readQuotation(api, initial.id)).projectId).toBe(project.id);
  const saved = await readQuotation(api, initial.id);
  const missing = `missing-${randomUUID()}`;
  const absent = waitSearch(page, missing);
  await field.fill(missing);
  expect((await absent).status()).toBe(200);
  await expect(page.getByText(NO_RESULTS, { exact: true })).toBeVisible();
  await expect(field).toHaveValue(missing);
  const continued = waitSearch(page, `${missing}a`);
  await field.pressSequentially("a");
  expect((await continued).status()).toBe(200);
  await expect(field).toHaveValue(`${missing}a`);
  await field.press(KEYBOARD_KEYS.ESCAPE);
  await expect(field).toHaveValue(project.name);
  expect((await readQuotation(api, initial.id)).version).toBe(saved.version);
  await field.focus();
  await quote.saved(() => page.getByRole("button", { name: "נקה בחירה", exact: true }).click());
  expect((await readQuotation(api, initial.id)).projectId).toBeNull();
  await page.reload();
  await expect(quote.field(PROJECT)).toHaveValue("");
  await quote.selectEntity(CUSTOMER, foreignCustomer.name);
  await quote.field(PROJECT).click();
  await expect(page.getByRole("option", { name: foreignProject.name, exact: true })).toBeVisible();
  await expect(page.getByRole("option", { name: project.name, exact: true })).toHaveCount(0);
  await page.screenshot({
    path: testInfo.outputPath("customer-scoped-project-search.png"),
    fullPage: true,
  });
});
