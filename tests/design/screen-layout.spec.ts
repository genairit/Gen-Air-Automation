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
  buildEditProjectRoute,
} from "../../src/utilities/route.utility.ts";

import { test, expect } from "../../src/fixtures/test.fixture.ts";
import { URLS } from "../../src/constants/environment.constant.ts";
import { USER_ROLES } from "../../src/constants/user-role.constant.ts";
import { TEST_USERS } from "../../src/constants/test-users.constant.ts";
import { PROJECT_TYPE_NAMES } from "../../src/constants/domain.constant.ts";
import { ROUTES, ROUTE_SEGMENTS } from "../../src/constants/routes.constant.ts";
import { createGenAirApi, loginThroughApi } from "../../src/api/gen-air-api.ts";
import type { ICustomer, IProject, ITask } from "../../src/interfaces/entities.interface.ts";
import { expectApartmentColumnsBeforeDrive } from "../../src/pages/apartment-layout.component.ts";

interface ILayoutScenario {
  task: ITask;
  project: IProject;
  building: IProject;
  apartment: IProject;
  customer: ICustomer;
}

const WIDTHS = [1440, 390] as const;
const SCREEN_NAMES = [
  "board",
  "newProject",
  "editProject",
  "project",
  "building",
  "apartment",
  "newApartment",
  "customers",
  "customer",
  "newCustomer",
  "tasks",
  "task",
  "newTask",
  "employees",
  "settings",
  "login",
] as const;
const state: { scenario: ILayoutScenario | null } = { scenario: null };

const readScenario = () => {
  if (!state.scenario) {
    throw new Error("Layout scenario has not been seeded");
  }
  return state.scenario;
};

const readScreens = (scenario: ILayoutScenario) => ({
  board: { path: ROUTES.BOARD, text: "פרויקטים" },
  newProject: { path: ROUTES.NEW_PROJECT, text: "יצירת פרויקט חדש" },
  editProject: { path: buildEditProjectRoute(scenario.project.id), text: "עריכת פרויקט" },
  project: { path: buildProjectRoute(scenario.project.id), text: scenario.project.name },
  building: { path: buildProjectRoute(scenario.building.id), text: scenario.building.name },
  apartment: {
    path: buildApartmentRoute(scenario.building.id, scenario.apartment.id),
    text: "נתונים מהפרויקט האב",
  },
  newApartment: {
    path: buildApartmentRoute(scenario.building.id, ROUTE_SEGMENTS.NEW),
    text: "הוספת דירה",
  },
  customers: { path: ROUTES.CUSTOMERS, text: "לקוח חדש" },
  customer: { path: buildCustomerRoute(scenario.customer.id), text: scenario.customer.name },
  newCustomer: { path: ROUTES.NEW_CUSTOMER, text: "זהות הלקוח" },
  tasks: { path: ROUTES.TASKS, text: "המשימות שלי" },
  task: { path: buildTaskRoute(scenario.task.id), text: scenario.task.title },
  newTask: { path: ROUTES.NEW_TASK, text: "פרטי המשימה" },
  employees: { path: ROUTES.EMPLOYEES, text: "ניהול עובדים ומשתמשים" },
  settings: { path: ROUTES.SETTINGS, text: "סטטוסי פרויקט קבועים" },
  login: { path: ROUTES.LOGIN, text: "התחברות למערכת" },
});

test.beforeAll(async ({ playwright }) => {
  const request = await playwright.request.newContext({ baseURL: URLS.BACKEND });
  try {
    const api = createGenAirApi(
      request,
      await loginThroughApi(request, TEST_USERS[USER_ROLES.SYSTEM_ADMIN]),
    );
    const customer = await seedCustomer(api);
    const building = await seedBuilding(api, customer);
    const project = await seedStandaloneProject(api, customer);
    const apartment = await seedApartment(api, building);
    const task = await seedTask(api, { link: { projectId: project.id } });
    state.scenario = { customer, building, project, apartment, task };
  } finally {
    await request.dispose();
  }
});

for (const width of WIDTHS) {
  for (const name of SCREEN_NAMES) {
    test(`${name} renders artwork and fits viewport ${width}px`, async ({ page }) => {
      const screen = readScreens(readScenario())[name];
      const errors: string[] = [];
      page.on("pageerror", error => errors.push(error.message));
      await page.setViewportSize({ width, height: 1000 });
      if (name === "login") {
        await page.goto(ROUTES.BOARD);
        await page.evaluate(() => localStorage.clear());
      }
      await page.goto(screen.path);
      await expect(page.getByText(screen.text, { exact: false }).first()).toBeVisible();
      await expect
        .poll(() =>
          page.evaluate(() =>
            [...document.images]
              .filter(image => !image.complete || image.naturalWidth === 0)
              .map(image => image.src),
          ),
        )
        .toEqual([]);
      await expect(page.locator('img[aria-hidden="true"]:visible').first()).toBeVisible();
      const geometry = await page.evaluate(() => ({
        viewport: innerWidth,
        content: document.documentElement.scrollWidth,
      }));
      expect(geometry.content).toBeLessThanOrEqual(geometry.viewport);
      expect(errors).toEqual([]);
      if (name === "newProject" && width === 1440) {
        const tiles = [];
        for (const title of Object.values(PROJECT_TYPE_NAMES)) {
          tiles.push(
            await page.getByText(title, { exact: true }).locator("xpath=..").boundingBox(),
          );
        }
        const visible = tiles.filter(tile => tile !== null);
        expect(visible).toHaveLength(Object.values(PROJECT_TYPE_NAMES).length);
        const firstRow = visible.filter(tile => tile.y === visible[0].y);
        expect(firstRow.length).toBeGreaterThan(1);
        const heights = firstRow.map(tile => tile.height);
        expect(Math.max(...heights) - Math.min(...heights)).toBeLessThanOrEqual(1);
      }
      if (name === "apartment" && width === 1440) {
        await expectApartmentColumnsBeforeDrive(page);
      }
      if (name === "apartment" || name === "task") {
        const tabs = page.getByRole("tablist").getByRole("tab");
        for (const tab of await tabs.all()) {
          await expect(tab.locator("span").first()).toHaveCSS("width", "7px");
        }
      }
      if (name === "building") {
        await expect(
          page.getByRole("button", { name: "ייבוא דירות מאקסל", exact: true }),
        ).toHaveCSS("background-color", "rgb(245, 245, 247)");
      }
      await page.screenshot({
        path: test.info().outputPath(`${name}-${width}.png`),
        fullPage: true,
      });
    });
  }
}
