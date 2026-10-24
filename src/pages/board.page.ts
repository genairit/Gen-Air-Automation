import type { Page } from "@playwright/test";
import { findTableRow } from "./table.component.ts";
import { findCountedTab } from "./tab.component.ts";
import { selectOption } from "./select.component.ts";
import { ROUTES } from "../constants/routes.constant.ts";
import { BOARD_COPY } from "../constants/copy.constant.ts";

export const createBoardPage = (page: Page) => {
  const newTaskButton = page.getByRole("button", { name: BOARD_COPY.NEW_TASK, exact: true });
  const searchBox = page.getByPlaceholder(BOARD_COPY.SEARCH_PLACEHOLDER);
  const newProjectButton = page.getByRole("button", { name: BOARD_COPY.NEW_PROJECT });

  const goto = () => page.goto(ROUTES.BOARD);

  const findRow = (text: string) => findTableRow(page, text);

  const statusTab = (statusName: string) => findCountedTab(page, statusName);

  const statusPicker = (projectName: string) => findRow(projectName).getByRole("combobox");

  const changeStatus = (projectName: string, statusName: string) =>
    selectOption(page, statusPicker(projectName), statusName);

  return {
    searchBox,
    newTaskButton,
    newProjectButton,
    goto,
    findRow,
    statusTab,
    statusPicker,
    changeStatus,
  };
};
