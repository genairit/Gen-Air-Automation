import { seedTaskScenario } from "../../src/api/seed-data.ts";
import { seedMultiRoleUser } from "../../src/api/multi-role.ts";
import { test, expect } from "../../src/fixtures/test.fixture.ts";
import { formatFullName } from "../../src/utilities/user.utility.ts";
import { createRoleMenu } from "../../src/pages/role-menu.component.ts";
import { KEYBOARD_KEYS } from "../../src/constants/keyboard.constant.ts";
import { TASK_STATUS_NAMES } from "../../src/constants/domain.constant.ts";
import { createProjectFormPage } from "../../src/pages/project-form.page.ts";
import { createTestDatabaseClient } from "../../src/environment/test-database-client.ts";
import { USER_ROLES, USER_ROLE_LABELS } from "../../src/constants/user-role.constant.ts";
import { createTaskFormPage, createTaskPage, createTasksPage } from "../../src/pages/tasks.page.ts";

const ADMIN = USER_ROLES.SYSTEM_ADMIN;
const FINANCE = USER_ROLES.FINANCE;
const ENGINEER = USER_ROLES.ENGINEER;

test("an assigned engineer remains selectable beyond the first lazy options batch", async ({
  api,
  page,
}) => {
  const engineer = await seedMultiRoleUser(api, [FINANCE, ENGINEER]);
  for (const index of Array.from({ length: 21 }, (_, index) => index)) {
    await test.step(`seed newer engineer ${index + 1}`, () => seedMultiRoleUser(api, [ENGINEER]));
  }
  const form = createTaskFormPage(page);
  await form.goto();
  await form.fillDetails({
    dueDate: "2030-01-15",
    title: "QA multi-role assignee",
    description: "QA lazy role-picker regression",
    assigneeName: formatFullName(engineer),
  });
  await expect(form.assigneePicker).toHaveValue(formatFullName(engineer));
});

test("engineer pickers use assigned roles even while the employee is active in finance", async ({
  api,
  page,
}) => {
  const engineer = await seedMultiRoleUser(api, [FINANCE, ENGINEER]);
  const financeOnly = await seedMultiRoleUser(api, [FINANCE]);
  const taskForm = createTaskFormPage(page);
  await taskForm.goto();
  const assignees = await taskForm.openAssigneeOptions();
  await expect(assignees.filter({ hasText: formatFullName(engineer) })).toBeVisible();
  await expect(assignees.filter({ hasText: formatFullName(financeOnly) })).toHaveCount(0);
  await page.keyboard.press(KEYBOARD_KEYS.ESCAPE);
  const projectForm = createProjectFormPage(page);
  await projectForm.goto();
  const members = await projectForm.openMemberSlot(ENGINEER);
  await expect(members.filter({ hasText: formatFullName(engineer) })).toBeVisible();
  await expect(members.filter({ hasText: formatFullName(financeOnly) })).toHaveCount(0);
});

test("personal tasks remain scoped to the same account across an active-role change", async ({
  api,
  openPageAs,
}) => {
  const user = await seedMultiRoleUser(api, [FINANCE, ENGINEER]);
  const mine = await seedTaskScenario(api, user.id);
  const other = await seedTaskScenario(api);
  const page = await openPageAs(user);
  const tasks = createTasksPage(page);
  await tasks.goto();
  await tasks.searchBox.fill(mine.task.title);
  await expect(tasks.findRow(mine.task.title)).toBeVisible();
  await tasks.searchBox.fill(other.task.title);
  await expect(tasks.findRow(other.task.title)).toHaveCount(0);
  await createRoleMenu(page).select(ENGINEER);
  await tasks.searchBox.fill(mine.task.title);
  await expect(tasks.findRow(mine.task.title)).toBeVisible();
  await tasks.searchBox.fill(other.task.title);
  await expect(tasks.findRow(other.task.title)).toHaveCount(0);
  await page.reload();
  await tasks.searchBox.fill(mine.task.title);
  await expect(tasks.findRow(mine.task.title)).toBeVisible();
});

test("history leaves legacy actor roles unknown and preserves the actual role of new changes", async ({
  api,
  apiAs,
  openPageAs,
}) => {
  const user = await seedMultiRoleUser(api, [ADMIN, ENGINEER]);
  const actor = await apiAs(user);
  const { task } = await seedTaskScenario(actor, user.id);
  const database = createTestDatabaseClient();
  await database.connect();
  try {
    await database.query(
      "UPDATE task_status_transitions SET changed_by_role = NULL WHERE task_id = $1",
      [task.id],
    );
    const page = await openPageAs(user);
    const view = createTaskPage(page);
    await view.goto(task.id);
    await expect(view.history.getByText(formatFullName(user), { exact: true })).toBeVisible();
    await createRoleMenu(page).select(ENGINEER);
    await view.statusTab(TASK_STATUS_NAMES.IN_PROGRESS).click();
    const author = `${formatFullName(user)} (${USER_ROLE_LABELS[ENGINEER]})`;
    await expect(view.history.getByText(author, { exact: true })).toBeVisible();
    await createRoleMenu(page).select(ADMIN);
    await page.reload();
    await expect(view.history.getByText(author, { exact: true })).toBeVisible();
    await expect(view.history.getByText(formatFullName(user), { exact: true })).toBeVisible();
    const transitions = await database.query<{ changed_by_role: string | null }>(
      "SELECT changed_by_role FROM task_status_transitions WHERE task_id = $1 ORDER BY created_at",
      [task.id],
    );
    expect(transitions.rows.map(row => row.changed_by_role)).toEqual([null, ENGINEER]);
  } finally {
    await database.end();
  }
});
