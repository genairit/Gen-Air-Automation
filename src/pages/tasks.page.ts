import {
  TASK_COPY,
  TASKS_COPY,
  TASK_FORM_COPY,
  TASK_LINK_KIND_COPY,
} from "../constants/copy.constant.ts";

import type { Page } from "@playwright/test";
import { findTableRow } from "./table.component.ts";
import { selectOption } from "./select.component.ts";
import { createProjectPage } from "./project.page.ts";
import { ROUTES } from "../constants/routes.constant.ts";
import { findTab, findCountedTab } from "./tab.component.ts";
import { buildStartPattern } from "../utilities/regex.utility.ts";
import type { TaskLinkKindType } from "../constants/domain.constant.ts";
import { selectDueDate, parseDateInputValue } from "./date-field.component.ts";
import { findLinkUnderLabel, findListUnderTitle, findLinkTileByLabel } from "./field.component.ts";
import {
  buildTaskRoute,
  buildProjectRoute,
  buildApartmentRoute,
} from "../utilities/route.utility.ts";

export interface ITaskDetailsInput {
  title: string;
  dueDate: string;
  description: string;
  assigneeName: string;
}

export const createTasksPage = (page: Page) => {
  const searchBox = page.getByPlaceholder(TASK_COPY.SEARCH_PLACEHOLDER);
  const newTaskButton = page.getByRole("button", { name: TASKS_COPY.CREATE_BUTTON });

  const goto = () => page.goto(ROUTES.TASKS);

  const tab = (label: string) => findCountedTab(page, label);

  const findRow = (text: string) => findTableRow(page, text);

  return { searchBox, newTaskButton, goto, tab, findRow };
};

export const createTaskFormPage = (page: Page) => {
  const form = page.getByRole("dialog", { name: /^(משימה חדשה|עריכת משימה)$/ });
  const saveButton = form.getByRole("button", { name: /^(שמור משימה|שמירת שינויים)$/ });
  const title = form.getByPlaceholder(TASK_FORM_COPY.TITLE_PLACEHOLDER);
  const description = form.getByPlaceholder(TASK_FORM_COPY.DESCRIPTION_PLACEHOLDER);
  const assigneePicker = form.getByRole("combobox", {
    name: buildStartPattern(TASK_COPY.ASSIGNEE),
  });
  const open = async () => {
    await createProjectPage(page).newTaskButton.click();
    await page.getByRole("menuitem", { name: /כללי/ }).click();
  };

  const goto = async (projectId: string, buildingId?: string) => {
    await page.goto(
      buildingId ? buildApartmentRoute(buildingId, projectId) : buildProjectRoute(projectId),
    );
    await open();
  };

  const fillDetails = async (input: ITaskDetailsInput) => {
    await selectOption(page, assigneePicker, input.assigneeName);
    await title.fill(input.title);
    await selectDueDate(page, parseDateInputValue(input.dueDate));
    await description.fill(input.description);
  };

  const openAssigneeOptions = async () => {
    await assigneePicker.click();

    const listboxId = await assigneePicker.getAttribute("aria-controls");

    if (!listboxId) {
      throw new Error("The assignee picker must identify its controlled listbox");
    }

    return page.locator(`[id=${JSON.stringify(listboxId)}]`).getByRole("option");
  };

  return {
    form,
    title,
    description,
    saveButton,
    assigneePicker,
    goto,
    open,
    fillDetails,
    openAssigneeOptions,
  };
};

export const createTaskPage = (page: Page) => {
  const history = findListUnderTitle(page, TASK_COPY.HISTORY_TITLE);
  const projectCustomerLink = findLinkUnderLabel(page, TASK_COPY.PROJECT_CUSTOMER);
  const markUrgentButton = page.getByRole("button", { name: TASK_COPY.MARK_URGENT });
  const claimButton = page.getByRole("button", { name: TASK_COPY.CLAIM });
  const editButton = page.getByRole("button", { name: "עריכת משימה", exact: true });
  const editor = createTaskFormPage(page);
  const assigneeSelect = editor.assigneePicker;
  const descriptionInput = editor.description;
  const saveDescriptionButton = editor.saveButton;

  const goto = (taskId: string) => page.goto(buildTaskRoute(taskId));

  const linkedTo = (kind: TaskLinkKindType) =>
    findLinkUnderLabel(page, TASK_LINK_KIND_COPY[kind].LINKED_TO);

  const linkedToTile = (kind: TaskLinkKindType) =>
    findLinkTileByLabel(page, TASK_LINK_KIND_COPY[kind].LINKED_TO);

  const statusTab = (statusName: string) => findTab(page, statusName);

  const markUrgent = async () => {
    await markUrgentButton.click();
    await page
      .getByRole("dialog")
      .getByRole("button", { name: TASK_COPY.CONFIRM_URGENT, exact: true })
      .click();
  };

  const changeAssignee = (assigneeName: string) => selectOption(page, assigneeSelect, assigneeName);

  return {
    history,
    editButton,
    claimButton,
    projectCustomerLink,
    assigneeSelect,
    markUrgentButton,
    descriptionInput,
    saveDescriptionButton,
    goto,
    linkedTo,
    linkedToTile,
    statusTab,
    markUrgent,
    changeAssignee,
    openAssigneeOptions: editor.openAssigneeOptions,
  };
};
