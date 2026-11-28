import { seedTaskScenario } from "../../src/api/seed-data.ts";
import { seedMultiRoleUser } from "../../src/api/multi-role.ts";
import { ROUTES } from "../../src/constants/routes.constant.ts";
import { test, expect } from "../../src/fixtures/test.fixture.ts";
import { createProjectPage } from "../../src/pages/project.page.ts";
import { VIEWPORTS } from "../../src/constants/viewport.constant.ts";
import { failApiRequests } from "../../src/mocks/api-request.mock.ts";
import { USER_ROLES } from "../../src/constants/user-role.constant.ts";
import { buildProjectRoute } from "../../src/utilities/route.utility.ts";
import { createTaskFormPage, createTaskPage, createTasksPage } from "../../src/pages/tasks.page.ts";

for (const viewport of [{ width: 1440, height: 1000 }, VIEWPORTS.MOBILE]) {
  test(`task editing preserves the owner and page context across all entry points at ${viewport.width}px`, async ({
    api,
    openPageAs,
  }) => {
    const editor = await seedMultiRoleUser(api, [USER_ROLES.SYSTEM_ADMIN, USER_ROLES.ENGINEER]);
    const { project, task } = await seedTaskScenario(api, editor.id);
    const page = await openPageAs(editor);
    await page.setViewportSize(viewport);
    const tasks = createTasksPage(page);
    const form = createTaskFormPage(page);
    const detail = createTaskPage(page);
    const editRow = (title: string) =>
      page.getByRole("button", { name: `עריכת משימה · ${title}`, exact: true });
    await tasks.goto();
    await tasks.searchBox.fill(task.title);
    await editRow(task.title).click();
    await expect(form.title).toHaveValue(task.title);
    await expect(form.title).toBeFocused();
    await expect(form.saveButton).toBeDisabled();
    await expect(form.form.getByText(project.name, { exact: true })).toBeVisible();
    await expect(form.form.getByRole("combobox", { name: "סוג משימה" })).toBeDisabled();
    await form.title.fill("טיוטה");
    await page.keyboard.press("Escape");
    await expect(form.form).toHaveCount(0);
    await expect(tasks.searchBox).toHaveValue(task.title);
    await expect(editRow(task.title)).toBeFocused();

    const updated = `${task.title} מעודכן`;
    await editRow(task.title).click();
    await form.title.fill(updated);
    const failure = await failApiRequests(page, `/task/${task.id}`);
    await form.saveButton.click();
    await expect(form.form.getByRole("alert")).toBeVisible();
    await expect(form.title).toHaveValue(updated);
    await failure.release();
    await form.saveButton.click();
    await expect(form.form).toHaveCount(0);
    await expect(tasks.searchBox).toHaveValue(task.title);
    await expect(editRow(updated)).toBeVisible();
    await expect(page).toHaveURL(ROUTES.TASKS);

    await createProjectPage(page).goto(project.id);
    await editRow(updated).click();
    await expect(form.title).toHaveValue(updated);
    const description = "תיאור שעודכן מתוך הפרויקט";
    await form.description.fill(description);
    await form.saveButton.click();
    await expect(form.form).toHaveCount(0);
    await expect(page).toHaveURL(buildProjectRoute(project.id));
    await page.getByText(updated, { exact: true }).click();
    await detail.editButton.click();
    await expect(form.description).toHaveValue(description);
    await expect(form.title).toHaveValue(updated);
    expect(await api.getTask(task.id)).toMatchObject({
      title: updated,
      description,
      projectId: project.id,
      assigneeId: editor.id,
    });
  });
}
