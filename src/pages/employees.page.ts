import {
  USER_ROLE_LABELS,
  type UserRoleType,
  USER_ROLE_PLURAL_LABELS,
} from "../constants/user-role.constant.ts";

import type { Page } from "@playwright/test";
import { findTableRow } from "./table.component.ts";
import { findCountedTab } from "./tab.component.ts";
import { selectOption } from "./select.component.ts";
import { findMainContent } from "./layout.component.ts";
import { ROUTES } from "../constants/routes.constant.ts";
import { findFieldContainer } from "./field.component.ts";
import { EMPLOYEES_COPY } from "../constants/copy.constant.ts";

export interface IEmployeeFormInput {
  name: string;
  email: string;
  phone: string;
  role: UserRoleType;
}

export const createEmployeesPage = (page: Page) => {
  const form = findMainContent(page);
  const searchBox = page.getByPlaceholder(EMPLOYEES_COPY.SEARCH_PLACEHOLDER);
  const addButton = page.getByRole("button", { name: EMPLOYEES_COPY.ADD_EMPLOYEE });
  const rolePicker = findFieldContainer(form, EMPLOYEES_COPY.ROLE_LABEL).getByRole("combobox");

  const goto = () => page.goto(ROUTES.EMPLOYEES);

  const findRow = (text: string) => findTableRow(page, text);

  const roleTab = (role: UserRoleType) => findCountedTab(page, USER_ROLE_PLURAL_LABELS[role]);

  const addEmployee = async (input: IEmployeeFormInput) => {
    await form.getByPlaceholder(EMPLOYEES_COPY.NAME_PLACEHOLDER).fill(input.name);
    await form.getByPlaceholder(EMPLOYEES_COPY.EMAIL_PLACEHOLDER).fill(input.email);
    await form.getByPlaceholder(EMPLOYEES_COPY.PHONE_PLACEHOLDER).fill(input.phone);
    await selectOption(page, rolePicker, USER_ROLE_LABELS[input.role]);
    await addButton.click();
  };

  const openRoleOptions = async () => {
    await rolePicker.click();

    return page.getByRole("option");
  };

  const deleteEmployee = (text: string) =>
    findRow(text).getByRole("button", { name: EMPLOYEES_COPY.DELETE_EMPLOYEE }).click();

  return {
    searchBox,
    addButton,
    rolePicker,
    goto,
    findRow,
    roleTab,
    addEmployee,
    deleteEmployee,
    openRoleOptions,
  };
};
