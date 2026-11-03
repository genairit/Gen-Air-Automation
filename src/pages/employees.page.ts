import {
  USER_ROLE_LABELS,
  USER_ROLE_VALUES,
  type UserRoleType,
  USER_ROLE_PLURAL_LABELS,
} from "../constants/user-role.constant.ts";

import type { Page } from "@playwright/test";
import { findTableRow } from "./table.component.ts";
import { findCountedTab } from "./tab.component.ts";
import { findMainContent } from "./layout.component.ts";
import { ROUTES } from "../constants/routes.constant.ts";
import { EMPLOYEES_COPY } from "../constants/copy.constant.ts";

export interface IEmployeeFormInput {
  name: string;
  email: string;
  phone: string;
  role: UserRoleType;
  assignedRoles?: UserRoleType[];
}

export const createEmployeesPage = (page: Page) => {
  const form = findMainContent(page);
  const searchBox = page.getByPlaceholder(EMPLOYEES_COPY.SEARCH_PLACEHOLDER);
  const addButton = page.getByRole("button", { name: EMPLOYEES_COPY.ADD_EMPLOYEE });
  const roleOptions = form.getByRole("checkbox");
  const roleCheckbox = (role: UserRoleType) =>
    form.getByRole("checkbox", { name: USER_ROLE_LABELS[role], exact: true });

  const goto = () => page.goto(ROUTES.EMPLOYEES);

  const findRow = (text: string) => findTableRow(page, text);

  const roleTab = (role: UserRoleType) => findCountedTab(page, USER_ROLE_PLURAL_LABELS[role]);

  const addEmployee = async (input: IEmployeeFormInput) => {
    const assignedRoles = input.assignedRoles ?? [input.role];
    await form.getByPlaceholder(EMPLOYEES_COPY.NAME_PLACEHOLDER).fill(input.name);
    await form.getByPlaceholder(EMPLOYEES_COPY.EMAIL_PLACEHOLDER).fill(input.email);
    await form.getByPlaceholder(EMPLOYEES_COPY.PHONE_PLACEHOLDER).fill(input.phone);
    for (const role of USER_ROLE_VALUES) {
      await roleCheckbox(role).setChecked(assignedRoles.includes(role));
    }
    await addButton.click();
  };

  const deleteEmployee = (text: string) =>
    findRow(text).getByRole("button", { name: EMPLOYEES_COPY.DELETE_EMPLOYEE }).click();

  return {
    searchBox,
    addButton,
    roleCheckbox,
    roleOptions,
    goto,
    findRow,
    roleTab,
    addEmployee,
    deleteEmployee,
  };
};
