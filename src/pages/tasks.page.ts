import {
  findLinkUnderLabel,
  findFieldContainer,
  findListUnderTitle,
  findLinkTileByLabel,
} from "./field.component.ts";

import {
  TASK_COPY,
  TASKS_COPY,
  TASK_FORM_COPY,
  TASK_LINK_COPY,
  TASK_LINK_KIND_COPY,
} from "../constants/copy.constant.ts";

import { findTableRow } from "./table.component.ts";
import { selectOption } from "./select.component.ts";
import type { Page, Locator } from "@playwright/test";
import { findMainContent } from "./layout.component.ts";
import { ROUTES } from "../constants/routes.constant.ts";
import { findTab, findCountedTab } from "./tab.component.ts";
import { buildTaskRoute } from "../utilities/route.utility.ts";
import type { TaskLinkKindType } from "../constants/domain.constant.ts";
import { buildStartPattern, buildSequencePattern } from "../utilities/regex.utility.ts";

export interface ITaskLinkChoice {
  name: string;
  kind: TaskLinkKindType;
}

export interface ITaskDetailsInput {
  title: string;
  dueDate: string;
  description: string;
  assigneeName: string;
}

export interface ITaskFormInput extends ITaskDetailsInput {
  link: ITaskLinkChoice;
}

interface ITaskLinkCaption {
  name: string;
  context?: string;
  kind: TaskLinkKindType;
}

const buildLinkCaptionPattern = (caption: ITaskLinkCaption): RegExp => {
  const parts = [TASK_LINK_KIND_COPY[caption.kind].LABEL, caption.name, caption.context ?? ""];

  return buildSequencePattern(parts);
};

export const buildLinkedToTilePattern = (kind: TaskLinkKindType, name: string): RegExp => {
  const copy = TASK_LINK_KIND_COPY[kind];

  return buildSequencePattern([copy.LINKED_TO, copy.LABEL, name]);
};

export const findTaskLinkCaption = (scope: Page | Locator, caption: ITaskLinkCaption): Locator =>
  scope.getByText(buildLinkCaptionPattern(caption));

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
  const linkKindGroup = form.getByRole("radiogroup", { name: TASK_LINK_COPY.KIND_GROUP });
  const linkPlaceholder = form.getByText(TASK_LINK_COPY.NO_KIND, { exact: true });
  const undoButton = form.getByRole("button", { name: TASK_LINK_COPY.UNDO, exact: true });
  const dismissButton = form.getByRole("button", { name: TASK_LINK_COPY.DISMISS, exact: true });
  const assigneePicker = form.getByRole("combobox", { name: TASK_FORM_COPY.ASSIGNEE_PLACEHOLDER });

  const goto = () => page.goto(ROUTES.NEW_TASK);

  const linkKindRadio = (kind: TaskLinkKindType) =>
    linkKindGroup.getByRole("radio", { name: buildStartPattern(TASK_LINK_KIND_COPY[kind].LABEL) });

  const linkSearch = (kind: TaskLinkKindType) =>
    form.getByPlaceholder(TASK_LINK_KIND_COPY[kind].SEARCH_PLACEHOLDER);

  const linkResults = (kind: TaskLinkKindType) =>
    form.getByRole("listbox", { name: TASK_LINK_KIND_COPY[kind].LABEL });

  const replaceLinkButton = (kind: TaskLinkKindType) =>
    form.getByRole("button", { name: TASK_LINK_KIND_COPY[kind].REPLACE });

  const notice = (text: string) => form.getByRole("status").filter({ hasText: text });

  const searchLink = async (link: ITaskLinkChoice) => {
    await linkSearch(link.kind).fill(link.name);

    return linkResults(link.kind).getByRole("option").filter({ hasText: link.name });
  };

  const chooseLink = async (link: ITaskLinkChoice) => {
    await linkKindRadio(link.kind).click();
    await (await searchLink(link)).click();
  };

  const fillDetails = async (input: ITaskDetailsInput) => {
    await selectOption(page, assigneePicker, input.assigneeName);
    await form.getByPlaceholder(TASK_FORM_COPY.TITLE_PLACEHOLDER).fill(input.title);
    await findFieldContainer(form, TASK_FORM_COPY.DUE_DATE).locator("input").fill(input.dueDate);
    await form.getByPlaceholder(TASK_FORM_COPY.DESCRIPTION_PLACEHOLDER).fill(input.description);
  };

  const fill = async (input: ITaskFormInput) => {
    await chooseLink(input.link);
    await fillDetails(input);
  };

  const openAssigneeOptions = async () => {
    await assigneePicker.click();

    return page.getByRole("option");
  };

  return {
    form,
    saveButton,
    undoButton,
    dismissButton,
    linkKindGroup,
    assigneePicker,
    linkPlaceholder,
    goto,
    fill,
    notice,
    linkSearch,
    chooseLink,
    searchLink,
    fillDetails,
    linkResults,
    linkKindRadio,
    replaceLinkButton,
    openAssigneeOptions,
  };
};

export const createTaskPage = (page: Page) => {
  const history = findListUnderTitle(page, TASK_COPY.HISTORY_TITLE);
  const projectCustomerLink = findLinkUnderLabel(page, TASK_COPY.PROJECT_CUSTOMER);
  const markUrgentButton = page.getByRole("button", { name: TASK_COPY.MARK_URGENT });
  const claimButton = page.getByRole("button", { name: TASK_COPY.CLAIM });
  const assigneeSelect = findFieldContainer(page, TASK_COPY.ASSIGNEE).getByRole("combobox");
  const descriptionInput = page.getByPlaceholder(TASK_COPY.DESCRIPTION_PLACEHOLDER);
  const saveDescriptionButton = page.getByRole("button", { name: TASK_COPY.SAVE_DESCRIPTION });

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

  const openAssigneeOptions = async () => {
    await assigneeSelect.click();

    return page.getByRole("option");
  };

  return {
    history,
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
    openAssigneeOptions,
  };
};
