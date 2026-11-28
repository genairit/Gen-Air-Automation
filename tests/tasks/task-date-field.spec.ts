import {
  selectDueDate,
  getUpcomingDate,
  findDueDateField,
  toDateDisplayValue,
} from "../../src/pages/date-field.component.ts";

import { test, expect } from "../../src/fixtures/test.fixture.ts";
import { createTaskFormPage } from "../../src/pages/tasks.page.ts";
import { VIEWPORTS } from "../../src/constants/viewport.constant.ts";
import { seedCustomer, seedStandaloneProject } from "../../src/api/seed-data.ts";

for (const viewport of [{ width: 1440, height: 1000 }, VIEWPORTS.MOBILE]) {
  test(`task due date uses a rounded Hebrew calendar at ${viewport.width}px`, async ({
    page,
    api,
  }, testInfo) => {
    await page.setViewportSize(viewport);
    const project = await seedStandaloneProject(api, await seedCustomer(api));
    await createTaskFormPage(page).goto(project.id);
    const field = findDueDateField(page);
    await expect(page.locator('input[type="date"]')).toHaveCount(0);
    await expect(field).toHaveValue("");
    await expect(field).toHaveAttribute("readonly", "");
    await expect(field).toHaveAttribute("placeholder", "בחר תאריך");

    await field.focus();
    await field.press("Enter");
    const calendar = page.locator(".MuiPopover-paper");
    await expect(calendar).toBeVisible();
    await expect(calendar.getByRole("grid", { name: /[א-ת]+ 20\d\d/ })).toBeVisible();
    await expect(calendar.getByRole("columnheader", { name: "יום ראשון" })).toBeVisible();
    await expect(calendar.getByRole("button", { name: "חודש קודם" })).toBeDisabled();
    await expect
      .poll(() => calendar.evaluate(element => getComputedStyle(element).opacity))
      .toBe("1");

    const appearance = await calendar.evaluate(element => {
      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return {
        radius: parseFloat(style.borderTopLeftRadius),
        border: style.borderTopWidth,
        background: style.backgroundColor,
        left: rect.left,
        right: rect.right,
        viewportWidth: innerWidth,
        pageWidth: document.documentElement.scrollWidth,
      };
    });
    expect(appearance.radius).toBeGreaterThanOrEqual(16);
    expect(appearance.border).not.toBe("0px");
    expect(appearance.background).toBe("rgb(255, 255, 255)");
    expect(appearance.left).toBeGreaterThanOrEqual(0);
    expect(appearance.right).toBeLessThanOrEqual(appearance.viewportWidth);
    expect(appearance.pageWidth).toBeLessThanOrEqual(appearance.viewportWidth);
    await calendar.screenshot({
      path: testInfo.outputPath(`task-date-calendar-${viewport.width}.png`),
    });

    await page.keyboard.press("Escape");
    await expect(calendar).toHaveCount(0);
    await expect(field).toBeFocused();
    await field.click();
    await page.mouse.click(4, 4);
    await expect(calendar).toHaveCount(0);

    const selectedDate = getUpcomingDate(14);
    await selectDueDate(page, selectedDate);
    await expect(field).toHaveValue(toDateDisplayValue(selectedDate));
    await expect(calendar).toHaveCount(0);
    await field.click();
    await calendar.getByRole("button", { name: "נקה תאריך" }).click();
    await expect(field).toHaveValue("");
  });
}
