import type { Page } from "@playwright/test";
import { findTableRow } from "./table.component.ts";
import { selectOption } from "./select.component.ts";
import { findMainContent } from "./layout.component.ts";
import { ROUTES } from "../constants/routes.constant.ts";
import { findTab, findCountedTab } from "./tab.component.ts";
import { buildTaskRoute } from "../utilities/route.utility.ts";
import { findFieldContainer, findListUnderTitle } from "./field.component.ts";
import { TASK_COPY, TASK_FORM_COPY, TASKS_COPY } from "../constants/copy.constant.ts";

export interface ITaskFormInput {
  title: string;
  dueDate: string;
  projectName: string;
  description: string;
  customerName: string;
  assigneeName: string;
}

export const createTasksPage = (page: Page) => {
  const searchBox = page.getByPlaceholder(TASK_COPY.SEARCH_PLACEHOLDER);
  const newTaskButton = page.getByRole("button", { name: TASKS_COPY.NEW_TASK });

  const goto = () => page.goto(ROUTES.TASKS);

  const tab = (label: string) => findCountedTab(page, label);

  const findRow = (text: string) => findTableRow(page, text);

  const statusPicker = (taskTitle: string) => findRow(taskTitle).getByRole("combobox");

  const changeStatus = (taskTitle: string, statusName: string) =>
    selectOption(page, statusPicker(taskTitle), statusName);

  return { searchBox, newTaskButton, goto, tab, findRow, statusPicker, changeStatus };
};

export const createTaskFormPage = (page: Page) => {
  const form = findMainContent(page);
  const saveButton = form.getByRole("button", { name: TASK_FORM_COPY.SAVE });
  const assigneePicker = form.getByRole("combobox", { name: TASK_FORM_COPY.ASSIGNEE_PLACEHOLDER });

  const goto = () => page.goto(ROUTES.NEW_TASK);

  const chooseProject = async (projectName: string) => {
    await form.getByPlaceholder(TASK_FORM_COPY.PROJECT_SEARCH_PLACEHOLDER).fill(projectName);
    await form.getByRole("option").filter({ hasText: projectName }).click();
  };

  const fill = async (input: ITaskFormInput) => {
    await chooseProject(input.projectName);
    await selectOption(
      page,
      form.getByRole("combobox", { name: TASK_FORM_COPY.CUSTOMER_PLACEHOLDER }),
      input.customerName,
    );
    await selectOption(page, assigneePicker, input.assigneeName);
    await form.getByPlaceholder(TASK_FORM_COPY.TITLE_PLACEHOLDER).fill(input.title);
    await findFieldContainer(form, TASK_FORM_COPY.DUE_DATE).locator("input").fill(input.dueDate);
    await form.getByPlaceholder(TASK_FORM_COPY.DESCRIPTION_PLACEHOLDER).fill(input.description);
  };

  const openAssigneeOptions = async () => {
    await assigneePicker.click();

    return page.getByRole("option");
  };

  return { saveButton, assigneePicker, goto, fill, openAssigneeOptions };
};

export const createTaskPage = (page: Page) => {
  const history = findListUnderTitle(page, TASK_COPY.HISTORY_TITLE);
  const markUrgentButton = page.getByRole("button", { name: TASK_COPY.MARK_URGENT });
  const claimButton = page.getByRole("button", { name: TASK_COPY.CLAIM });
  const assigneeSelect = findFieldContainer(page, TASK_COPY.ASSIGNEE).getByRole("combobox");
  const descriptionInput = page.getByPlaceholder(TASK_COPY.DESCRIPTION_PLACEHOLDER);
  const saveDescriptionButton = page.getByRole("button", { name: TASK_COPY.SAVE_DESCRIPTION });

  const goto = (taskId: string) => page.goto(buildTaskRoute(taskId));

  const statusTab = (statusName: string) => findTab(page, statusName);

  const markUrgent = async () => {
    await markUrgentButton.click();
    await page
      .getByRole("dialog")
      .getByRole("button", { name: TASK_COPY.CONFIRM_URGENT, exact: true })
      .click();
  };

  const changeAssignee = (assigneeName: string) => selectOption(page, assigneeSelect, assigneeName);

  const openAssigneeOptions = async () => {
    await assigneeSelect.click();

    return page.getByRole("option");
  };

  return {
    history,
    claimButton,
    assigneeSelect,
    markUrgentButton,
    descriptionInput,
    saveDescriptionButton,
    goto,
    statusTab,
    markUrgent,
    changeAssignee,
    openAssigneeOptions,
  };
};
