import { test, expect } from "../../src/fixtures/test.fixture.ts";
import { createProjectPage } from "../../src/pages/project.page.ts";
import { TASK_TYPES } from "../../src/constants/domain.constant.ts";
import { VIEWPORTS } from "../../src/constants/viewport.constant.ts";
import { seedCustomer, seedStandaloneProject } from "../../src/api/seed-data.ts";

for (const viewport of [{ width: 1440, height: 1000 }, VIEWPORTS.MOBILE]) {
  test(`project task menu is a rounded, readable RTL chooser at ${viewport.width}px`, async ({
    page,
    api,
  }, testInfo) => {
    await page.setViewportSize(viewport);
    const project = await seedStandaloneProject(api, await seedCustomer(api));
    const projectPage = createProjectPage(page);
    await projectPage.goto(project.id);
    await projectPage.newTaskButton.click();

    const menu = page.getByRole("menu", { name: "בחר סוג משימה" });
    const quotation = menu.getByRole("menuitem", { name: /הצעת מחיר.*יצירת משימה/ });
    const planning = menu.getByRole("menuitem", { name: /תכנון.*יצירת משימה/ });
    const general = menu.getByRole("menuitem", { name: /כללי.*יצירת משימה/ });
    const paper = page.locator(".MuiMenu-paper");

    await expect(menu).toBeVisible();
    await expect(menu.getByText("בחר סוג משימה")).toBeVisible();
    await expect(quotation).toBeEnabled();
    await expect(planning).toBeEnabled();
    await expect(general).toBeEnabled();
    await expect(quotation).toBeFocused();

    const appearance = await paper.evaluate(element => {
      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return {
        radius: parseFloat(style.borderTopLeftRadius),
        shadow: style.boxShadow,
        background: style.backgroundColor,
        left: rect.left,
        right: rect.right,
        width: rect.width,
        viewportWidth: innerWidth,
        pageWidth: document.documentElement.scrollWidth,
        direction: getComputedStyle(element).direction,
      };
    });
    expect(appearance.radius).toBeGreaterThanOrEqual(16);
    expect(appearance.shadow).not.toBe("none");
    expect(appearance.background).toBe("rgb(255, 255, 255)");
    expect(appearance.direction).toBe("rtl");
    expect(appearance.left).toBeGreaterThanOrEqual(0);
    expect(appearance.right).toBeLessThanOrEqual(appearance.viewportWidth);
    expect(appearance.width).toBeLessThanOrEqual(appearance.viewportWidth - 32);
    expect(appearance.pageWidth).toBeLessThanOrEqual(appearance.viewportWidth);
    await paper.screenshot({ path: testInfo.outputPath(`task-menu-${viewport.width}.png`) });

    await page.keyboard.press("ArrowDown");
    await expect(planning).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(menu).toHaveCount(0);
    await expect(projectPage.newTaskButton).toBeFocused();

    await projectPage.newTaskButton.click();
    await page.mouse.click(4, 4);
    await expect(menu).toHaveCount(0);
  });
}

test("task menu keeps unavailable protected slots visible and opens an existing slot", async ({
  page,
  api,
}) => {
  const project = await seedStandaloneProject(api, await seedCustomer(api));
  const quotation = await api.createTask({
    projectId: project.id,
    taskType: TASK_TYPES.QUOTATION,
    title: "הצעה קיימת",
    description: "בדיקת תפריט",
  });
  const planning = await api.createTask({
    projectId: project.id,
    taskType: TASK_TYPES.PLANNING,
    title: "תכנון שמוסתר בתפריט",
    description: "בדיקת תפריט",
  });
  await page.route(`**/task/project/${project.id}/protected`, route =>
    route.fulfill({
      status: 200,
      json: [
        { id: quotation.id, taskType: TASK_TYPES.QUOTATION, available: true },
        { id: planning.id, taskType: TASK_TYPES.PLANNING, available: false },
      ],
    }),
  );

  const projectPage = createProjectPage(page);
  await projectPage.goto(project.id);
  await projectPage.newTaskButton.click();
  const menu = page.getByRole("menu", { name: "בחר סוג משימה" });
  await expect(
    menu.getByRole("menuitem", { name: /תכנון.*משימה קיימת אינה זמינה/ }),
  ).toBeDisabled();
  await expect(menu.getByRole("menuitem", { name: /כללי.*יצירת משימה/ })).toBeEnabled();
  await menu.getByRole("menuitem", { name: /הצעת מחיר.*פתח משימה קיימת/ }).click();
  await expect(page).toHaveURL(new RegExp(`/tasks/${quotation.id}$`));
});
