import {
  seedTask,
  seedCustomer,
  seedBuilding,
  seedApartment,
  seedStandaloneProject,
} from "../../src/api/seed-data.ts";

import {
  buildTaskRoute,
  buildProjectRoute,
  buildCustomerRoute,
  buildApartmentRoute,
} from "../../src/utilities/route.utility.ts";

import type { Page, Locator } from "@playwright/test";
import { test, expect } from "../../src/fixtures/test.fixture.ts";
import { findCardByTitle } from "../../src/pages/card.component.ts";
import { FAKE_PLACES } from "../../src/constants/fake-places.constant.ts";
import { createProjectFormPage } from "../../src/pages/project-form.page.ts";
import { ROUTES, ROUTE_SEGMENTS } from "../../src/constants/routes.constant.ts";
import { openWorkspaceTab } from "../../src/pages/project-workspace.component.ts";

interface ICardPair {
  first: string;
  second: string;
  widePlacement?: "adaptive" | "stacked";
}

interface IPageScenario {
  path: string;
  name: string;
  tab?: "details";
  pairs: ICardPair[];
}

const VIEWPORTS = [
  { width: 1600, height: 1000, placement: "paired" },
  { width: 1100, height: 1000, placement: "adaptive" },
  { width: 800, height: 1000, placement: "stacked" },
  { width: 390, height: 844, placement: "stacked" },
] as const;

const expectCardsFit = async (page: Page, first: Locator, second: Locator) => {
  const geometry = await page.evaluate(() => ({
    viewport: innerWidth,
    content: document.documentElement.scrollWidth,
  }));
  expect(geometry.content).toBeLessThanOrEqual(geometry.viewport);
  for (const card of [first, second]) {
    const box = await card.boundingBox();
    if (!box) {
      throw new Error("Expected a visible card boundary");
    }
    expect(box.x).toBeGreaterThanOrEqual(-1);
    expect(box.x + box.width).toBeLessThanOrEqual(geometry.viewport + 1);
  }
};

const expectPairPlacement = async (
  first: Locator,
  second: Locator,
  placement: (typeof VIEWPORTS)[number]["placement"],
) => {
  const firstBox = await first.boundingBox();
  const secondBox = await second.boundingBox();
  if (!firstBox || !secondBox) {
    throw new Error("Expected both card boundaries");
  }
  const sameRow = Math.abs(firstBox.y - secondBox.y) <= 2;
  const secondBelow = secondBox.y >= firstBox.y + firstBox.height;
  if (placement === "paired") {
    expect(sameRow).toBe(true);
    expect(firstBox.x).toBeGreaterThan(secondBox.x);
  }
  if (placement === "stacked") {
    expect(secondBelow).toBe(true);
    for (const [card, box] of [
      [first, firstBox],
      [second, secondBox],
    ] as const) {
      const parentWidth = await card.evaluate(
        element => element.parentElement?.getBoundingClientRect().width ?? 0,
      );
      expect(parentWidth).toBeGreaterThan(0);
      expect(box.width).toBeGreaterThanOrEqual(parentWidth - 2);
    }
  }
  if (placement === "adaptive") {
    expect(sameRow || secondBelow).toBe(true);
  }
};

for (const viewport of VIEWPORTS) {
  test(`related cards pair or stack without clipping at ${viewport.width}px`, async ({
    page,
    api,
  }) => {
    const customer = await seedCustomer(api);
    const building = await seedBuilding(api, customer);
    const project = await seedStandaloneProject(api, customer);
    const apartment = await seedApartment(api, building);
    const task = await seedTask(api, { link: { projectId: project.id } });
    const scenarios: IPageScenario[] = [
      {
        name: "customer",
        path: buildCustomerRoute(customer.id),
        pairs: [
          { first: "פרטי הלקוח", second: "פרטי קשר של הלקוח" },
          { first: "סנכרון עם Priority", second: "תנאי תשלום כברירת מחדל" },
        ],
      },
      {
        name: "standalone project",
        tab: "details",
        path: buildProjectRoute(project.id),
        pairs: [{ first: "כתובת", second: "לקוח ופרטי הנכס" }],
      },
      {
        name: "building",
        tab: "details",
        path: buildProjectRoute(building.id),
        pairs: [{ first: "נתונים שעוברים לכל הדירות", second: "לקוח ופרטי הנכס" }],
      },
      {
        name: "apartment",
        tab: "details",
        path: buildApartmentRoute(building.id, apartment.id),
        pairs: [{ first: "לקוח קצה — דירה זו", second: "נתונים מהפרויקט האב" }],
      },
      {
        name: "task",
        path: buildTaskRoute(task.id),
        pairs: [],
      },
      {
        name: "new customer",
        path: ROUTES.NEW_CUSTOMER,
        pairs: [
          { first: "זהות הלקוח", second: "פרטי קשר של הלקוח (לא חובה)", widePlacement: "stacked" },
          { first: "תנאי תשלום כברירת מחדל", second: "מה יישמר", widePlacement: "adaptive" },
        ],
      },
      {
        name: "new project",
        path: ROUTES.NEW_PROJECT,
        pairs: [],
      },
      {
        name: "new apartment",
        path: buildApartmentRoute(building.id, ROUTE_SEGMENTS.NEW),
        pairs: [{ first: "פרטי הדירה", second: "לקוח הדירה *" }],
      },
      {
        name: "new task",
        path: ROUTES.NEW_TASK,
        pairs: [{ first: "שיוך", second: "פרטי המשימה" }],
      },
    ];

    for (const scenario of scenarios) {
      await test.step(scenario.name, async (): Promise<void> => {
        const scenarioPage = await page.context().newPage();
        try {
          await scenarioPage.setViewportSize({ width: viewport.width, height: viewport.height });
          await scenarioPage.goto(scenario.path);
          if (scenario.tab) await openWorkspaceTab(scenarioPage, scenario.tab);
          if (scenario.name === "new project") {
            const form = createProjectFormPage(scenarioPage);
            await expect(form.addressInput).toBeVisible();
            await expect(form.customerSearch).toBeVisible();
            await expectCardsFit(scenarioPage, form.addressInput, form.customerSearch);
          }
          if (scenario.name === "new apartment") {
            await openWorkspaceTab(scenarioPage, "people");
            await expect(scenarioPage.getByText("צוות הדירה", { exact: true })).toBeVisible();
            await openWorkspaceTab(scenarioPage, "technical");
            await expect(
              scenarioPage.getByText("הנמכה כללית לתאורה", { exact: true }),
            ).toBeVisible();
            await openWorkspaceTab(scenarioPage, "details");
          }
          if (scenario.name === "task") {
            const urgency = findCardByTitle(scenarioPage, "משימה רגילה");
            const details = findCardByTitle(scenarioPage, "פרטי המשימה");
            await expect(urgency).toBeVisible();
            await expect(details).toBeVisible();
            await expectCardsFit(scenarioPage, urgency, details);
            const urgencyBox = await urgency.boundingBox();
            const detailsBox = await details.boundingBox();
            if (!urgencyBox || !detailsBox) {
              throw new Error("Expected task strip and details bounds");
            }
            expect(detailsBox.y).toBeGreaterThanOrEqual(urgencyBox.y + urgencyBox.height - 2);
            expect(Math.abs(urgencyBox.width - detailsBox.width)).toBeLessThanOrEqual(2);
          }
          for (const pair of scenario.pairs) {
            const first = findCardByTitle(scenarioPage, pair.first).first();
            const second =
              scenario.name === "new apartment"
                ? scenarioPage.locator("[data-apartment-customer]").filter({ hasText: pair.second })
                : findCardByTitle(scenarioPage, pair.second).first();
            await expect(first).toBeVisible();
            await expect(second).toBeVisible();
            await expectCardsFit(scenarioPage, first, second);
            await expectPairPlacement(
              first,
              second,
              viewport.width === 1600
                ? (pair.widePlacement ?? viewport.placement)
                : viewport.placement,
            );
          }
          if (viewport.width === 1600 || viewport.width === 390) {
            await scenarioPage.screenshot({
              path: test
                .info()
                .outputPath(`${scenario.name.replaceAll(" ", "-")}-${viewport.width}.png`),
              fullPage: true,
            });
          }
        } finally {
          await scenarioPage.close();
        }
      });
    }
  });
}

test("mobile own customer details and project address picker remain usable", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(ROUTES.NEW_CUSTOMER);
  await page
    .getByRole("textbox", { name: "טלפון ראשי של הלקוח", exact: true })
    .fill("+12025550123");
  await page
    .getByRole("textbox", { name: "דוא״ל של הלקוח", exact: true })
    .fill("mobile-own@example.test");
  await expect(page.getByPlaceholder("שם, טלפון או דוא״ל")).toHaveCount(0);

  const projectForm = createProjectFormPage(page);
  await projectForm.goto();
  await projectForm.addressInput.fill(FAKE_PLACES[0].mainText);
  const optionName = [FAKE_PLACES[0].mainText, FAKE_PLACES[0].secondaryText]
    .filter(Boolean)
    .join(" ");
  await page.getByRole("option", { name: optionName, exact: true }).click();
  await expect(projectForm.addressVerified).toBeVisible();
  await expect(projectForm.addressInput).toHaveValue(FAKE_PLACES[0].formattedAddress);
});
