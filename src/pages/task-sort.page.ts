import {
  TASK_SORT_COPY,
  TASK_SORT_FIXTURE,
  type TaskSortModeType,
} from "../constants/task-sort.constant.ts";

import { expect, type Page } from "@playwright/test";
import { ROUTES } from "../constants/routes.constant.ts";
import { TASK_COPY } from "../constants/copy.constant.ts";
import { selectMuiOption } from "./mui-select.component.ts";
import { escapeRegex } from "../utilities/regex.utility.ts";
import type { ITaskSortRow, ITaskSortView } from "../interfaces/task-sort.interface.ts";

const SORT_LABELS: Record<TaskSortModeType, string> = {
  default: TASK_SORT_COPY.DEFAULT,
  due_date_asc: TASK_SORT_COPY.EARLIEST,
  due_date_desc: TASK_SORT_COPY.LATEST,
};

const KEYBOARD_POSITIONS: Record<TaskSortModeType, number> = {
  default: 0,
  due_date_asc: 1,
  due_date_desc: 2,
};

export const createTaskSortPage = (page: Page, prefix: string): ITaskSortView => {
  const sort = page.getByRole("combobox", { name: TASK_SORT_COPY.LABEL, exact: true });
  const titles = page.getByText(
    new RegExp("^" + escapeRegex(prefix) + " \\d{" + TASK_SORT_FIXTURE.TITLE_DIGITS + "}$"),
  );
  const search = page.getByPlaceholder(TASK_COPY.SEARCH_PLACEHOLDER);
  const retry = page.getByRole("button", { name: TASK_SORT_COPY.RETRY, exact: true });
  const goto = async (): Promise<void> => {
    await page.goto(ROUTES.TASKS);
    await expect(sort).toBeVisible();
    await search.fill(prefix);
    await expect(titles.first()).toBeVisible();
  };
  const choose = (mode: TaskSortModeType): Promise<void> => selectMuiOption(page, sort, mode);
  const chooseByKeyboard = async (mode: TaskSortModeType): Promise<void> => {
    await sort.focus();
    await sort.press("ArrowDown");
    await expect(page.getByRole("listbox")).toBeVisible();
    await page.keyboard.press("Home");
    for (const _ of Array.from({ length: KEYBOARD_POSITIONS[mode] })) {
      await page.keyboard.press("ArrowDown");
    }

    await page.keyboard.press("Enter");
    await expect(sort).toHaveText(SORT_LABELS[mode]);
  };
  const expectAll = async (rows: ITaskSortRow[]): Promise<void> => {
    await expect
      .poll(async () => {
        const count = await titles.count();
        if (count > 0 && count < rows.length) {
          await titles.last().scrollIntoViewIfNeeded();
        }

        return count;
      })
      .toBe(rows.length);
    await expect(titles).toHaveText(rows.map(row => row.title));
  };
  return { sort, titles, search, retry, goto, choose, chooseByKeyboard, expectAll };
};
