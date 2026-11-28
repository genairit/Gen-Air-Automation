import {
  seedCustomer,
  seedBuilding,
  seedApartment,
  seedStandaloneProject,
} from "../../src/api/seed-data.ts";

import { test, expect } from "../../src/fixtures/test.fixture.ts";
import { HTTP_METHODS } from "../../src/constants/http.constant.ts";
import { USER_ROLES } from "../../src/constants/user-role.constant.ts";
import { TEST_USERS } from "../../src/constants/test-users.constant.ts";
import { buildBrowserApiPattern } from "../../src/utilities/api-path.utility.ts";
import { buildProjectRoute, buildApartmentRoute } from "../../src/utilities/route.utility.ts";
import { seedNamedBoq, reviseNamedBoqCost } from "../../src/environment/project-boq-fixtures.ts";

const COPY = {
  tab: "כתבי רכש",
  empty: "אין כתבי רכש בפרויקט זה",
  loading: "טוען כתבי רכש...",
  retry: "נסה שוב",
} as const;
const documentsPath = (id: string) => `/project-boq/${id}/documents`;
const purchaseRoute = (id: string) => `${buildProjectRoute(id)}?tab=purchase`;

test("project purchase cards show each named document and its own latest estimate without actions", async ({
  page,
  api,
}, testInfo) => {
  const project = await seedStandaloneProject(api, await seedCustomer(api));
  const first = await seedNamedBoq(project.id, "מיזוג קומת קרקע");
  const second = await seedNamedBoq(project.id, "מיזוג קומה א׳", "3", "100");
  const other = await seedStandaloneProject(api, await seedCustomer(api));
  await seedNamedBoq(other.id, "כתב רכש של פרויקט אחר", "1", "900");
  const response = await api.send(HTTP_METHODS.GET, documentsPath(project.id));
  expect(response.status()).toBe(200);
  expect(await response.json()).toEqual([
    { id: first.id, name: "מיזוג קומת קרקע", estimatedTotal: "250.5000" },
    { id: second.id, name: "מיזוג קומה א׳", estimatedTotal: "300.0000" },
  ]);
  await page.goto(purchaseRoute(project.id));
  const panel = page.getByRole("tabpanel", { name: COPY.tab, exact: true });
  await expect(panel.getByRole("heading")).toHaveCount(2);
  await expect(panel.getByRole("heading", { name: "מיזוג קומת קרקע" })).toBeVisible();
  await expect(panel.locator("bdi").first()).toContainText("250.50");
  await expect(panel.locator("bdi").last()).toContainText("300.00");
  await expect(panel.locator("bdi").first()).toContainText("₪");
  await reviseNamedBoqCost(first.id, "200");
  await page.reload();
  await expect(panel.getByRole("heading")).toHaveCount(2);
  await expect(panel.locator("bdi").first()).toContainText("400.00");
  await expect(panel.locator("bdi").last()).toContainText("300.00");
  await expect(panel.getByText("כתב רכש של פרויקט אחר")).toHaveCount(0);
  await expect(panel.locator("button, a, [role=button], [tabindex]")).toHaveCount(0);
  await panel.getByRole("heading").first().click();
  await expect(page).toHaveURL(purchaseRoute(project.id));
  await page.screenshot({ path: testInfo.outputPath("purchase-desktop.png") });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(panel.getByRole("heading").last()).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath("purchase-mobile.png") });
  await page.goto(purchaseRoute(other.id));
  await expect(page.getByRole("heading", { name: "כתב רכש של פרויקט אחר" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "מיזוג קומת קרקע" })).toHaveCount(0);
  expect((await api.send(HTTP_METHODS.GET, `/project-boq/${project.id}`)).status()).toBe(409);
});

test("empty tab, loading and failed request retry remain distinct", async ({ page, api }) => {
  const project = await seedStandaloneProject(api, await seedCustomer(api));
  const pattern = buildBrowserApiPattern(documentsPath(project.id));
  const pending = { release: () => {} };
  const hold = new Promise<void>(resolve => {
    pending.release = resolve;
  });
  await page.route(pattern, async route => {
    await hold;
    await route.continue();
  });
  await page.goto(purchaseRoute(project.id));
  await expect(page.getByText(COPY.loading, { exact: true })).toBeVisible();
  await expect(page.getByText(COPY.empty, { exact: true })).toHaveCount(0);
  pending.release();
  await expect(page.getByText(COPY.empty, { exact: true })).toBeVisible();
  await page.unroute(pattern);
  await page.route(pattern, route =>
    route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({ message: "Purchase list unavailable" }),
    }),
  );
  await page.reload();
  await expect(page.getByRole("alert")).toContainText("Purchase list unavailable");
  await expect(page.getByText(COPY.empty, { exact: true })).toHaveCount(0);
  await page.unroute(pattern);
  await page.getByRole("button", { name: COPY.retry, exact: true }).click();
  await expect(page.getByText(COPY.empty, { exact: true })).toBeVisible();
});

test("building and apartment documents use their own project link and preserve the selected tab on redirect", async ({
  page,
  api,
}) => {
  const building = await seedBuilding(api, await seedCustomer(api));
  const apartment = await seedApartment(api, building);
  await seedNamedBoq(building.id, "רכש בניין");
  await seedNamedBoq(apartment.id, "רכש דירה");
  await page.goto(purchaseRoute(building.id));
  await expect(page.getByRole("heading", { name: "רכש בניין" })).toBeVisible();
  await page.goto(purchaseRoute(apartment.id));
  await expect(page).toHaveURL(`${buildApartmentRoute(building.id, apartment.id)}?tab=purchase`);
  await expect(page.getByRole("tab", { name: COPY.tab, exact: true })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await expect(page.getByRole("heading", { name: "רכש דירה" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "רכש בניין" })).toHaveCount(0);
  await page.goto(`/project-boqs/${apartment.id}`);
  await page.getByRole("link", { name: /חזרה לכתבי רכש/ }).click();
  await expect(page).toHaveURL(`${buildApartmentRoute(building.id, apartment.id)}?tab=purchase`);
});

test("purchase permission is enforced by the tab and API while the retired directory redirects", async ({
  api,
  apiAs,
  openPageAs,
}) => {
  const project = await seedStandaloneProject(api, await seedCustomer(api));
  const engineer = await apiAs(TEST_USERS[USER_ROLES.ENGINEER]);
  expect((await engineer.send(HTTP_METHODS.GET, documentsPath(project.id))).status()).toBe(403);
  const deniedPage = await openPageAs(TEST_USERS[USER_ROLES.ENGINEER]);
  await deniedPage.goto(purchaseRoute(project.id));
  await expect(deniedPage.getByRole("tab", { name: COPY.tab, exact: true })).toHaveCount(0);
  const allowed = await apiAs(TEST_USERS[USER_ROLES.PURCHASING_EXECUTION_MANAGER]);
  expect((await allowed.send(HTTP_METHODS.GET, documentsPath(project.id))).status()).toBe(200);
  const page = await openPageAs(TEST_USERS[USER_ROLES.PURCHASING_EXECUTION_MANAGER]);
  await page.goto(purchaseRoute(project.id));
  await expect(page.getByRole("tab", { name: COPY.tab, exact: true })).toBeVisible();
  await expect(page.getByText(COPY.empty, { exact: true })).toBeVisible();
  await expect(page.locator('a[href="/project-boqs"]')).toHaveCount(0);
  await page.goto("/project-boqs");
  await expect(page).toHaveURL("/");
});
