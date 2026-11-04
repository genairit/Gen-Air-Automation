import type { Page } from "@playwright/test";
import { findTableRow } from "./table.component.ts";
import { findCountedTab } from "./tab.component.ts";
import { ROUTES } from "../constants/routes.constant.ts";
import { BOARD_COPY } from "../constants/copy.constant.ts";

export const createBoardPage = (page: Page) => {
  const newTaskButton = page.getByRole("button", { name: BOARD_COPY.NEW_TASK, exact: true });
  const searchBox = page.getByPlaceholder(BOARD_COPY.SEARCH_PLACEHOLDER);
  const newProjectButton = page.getByRole("button", { name: BOARD_COPY.NEW_PROJECT });

  const goto = () => page.goto(ROUTES.BOARD);

  const findRow = (text: string) => findTableRow(page, text);

  const statusTab = (statusName: string) => findCountedTab(page, statusName);

  return {
    searchBox,
    newTaskButton,
    newProjectButton,
    goto,
    findRow,
    statusTab,
  };
};
