import type { Page } from "@playwright/test";
import { findTableRow } from "./table.component.ts";
import { ROUTES } from "../constants/routes.constant.ts";
import { BOARD_COPY } from "../constants/copy.constant.ts";
import { escapeRegex } from "../utilities/regex.utility.ts";

export const createBoardPage = (page: Page) => {
  const card = page.getByRole("region", { name: BOARD_COPY.CARD, exact: true });
  const typeFilter = card.getByRole("combobox", { name: BOARD_COPY.TYPE_FILTER, exact: true });
  const statusFilter = card.getByRole("combobox", { name: BOARD_COPY.STATUS_FILTER, exact: true });
  const newTaskButton = card.getByRole("button", { name: BOARD_COPY.NEW_TASK, exact: true });
  const searchBox = card.getByPlaceholder(BOARD_COPY.SEARCH_PLACEHOLDER);
  const newProjectButton = card.getByRole("button", { name: BOARD_COPY.NEW_PROJECT });

  const goto = () => page.goto(ROUTES.BOARD);

  const findRow = (text: string) => findTableRow(page, text);

  const statusOption = (name: string, count?: number) =>
    page.getByRole("option", { name: new RegExp(`^${escapeRegex(name)}\\s+${count ?? "\\d+"}$`) });

  return {
    searchBox,
    newTaskButton,
    newProjectButton,
    goto,
    findRow,
    card,
    typeFilter,
    statusFilter,
    statusOption,
  };
};
